// The published question bank, as teachers browse it and pick from it for homework.
// Teachers and admins may see answer keys and explanations (students never go through here).
// Only published questions are exposed; authoring and import belong to admins.

import { and, asc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { modules, questions, topics } from "@/db/schema";
import { getActiveCurriculum } from "./curriculum";
import { ForbiddenError, ValidationError, type Actor, type Db } from "./types";

export const QUESTION_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_PREVIEW_IDS = 60;

export function assertTeacher(actor: Actor) {
  if (actor.role !== "teacher" && actor.role !== "admin") throw new ForbiddenError("Only teachers can browse the question bank.");
}

export type BankQuestion = {
  id: string;
  stem: string;
  options: { key: string; text: string }[];
  correctKey: string;
  explanation: string;
  /** 1 easy, 2 medium, 3 hard */
  difficulty: number;
  source: string;
  moduleId: string | null;
  moduleNumber: number | null;
  moduleTitle: string | null;
  topicId: string | null;
  topicName: string | null;
};

export type QuestionFilters = {
  moduleId?: string;
  topicId?: string;
  /** Matches the question stem (case-insensitive). */
  search?: string;
  difficulty?: 1 | 2 | 3;
  page?: number;
  pageSize?: number;
};

const columns = {
  id: questions.id,
  stem: questions.stem,
  options: questions.options,
  correctKey: questions.correctKey,
  explanation: questions.explanation,
  difficulty: questions.difficulty,
  source: questions.source,
  moduleId: questions.moduleId,
  moduleNumber: modules.number,
  moduleTitle: modules.title,
  topicId: topics.id,
  topicName: topics.name,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A page of published questions, in curriculum order (topic, chapter), then easier first. */
export async function listQuestions(db: Db, actor: Actor, filters: QuestionFilters = {}) {
  assertTeacher(actor);
  const active = await getActiveCurriculum(db);
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(filters.pageSize ?? QUESTION_PAGE_SIZE)));
  const search = filters.search?.trim().slice(0, 100);

  const where: SQL[] = [eq(questions.status, "published"), eq(topics.versionId, active.version.id)];
  if (filters.moduleId) where.push(eq(questions.moduleId, filters.moduleId));
  if (filters.topicId) where.push(eq(topics.id, filters.topicId));
  if (filters.difficulty) where.push(eq(questions.difficulty, filters.difficulty));
  if (search) where.push(ilike(questions.stem, `%${escapeLike(search)}%`));

  const base = db
    .select(columns)
    .from(questions)
    .innerJoin(modules, eq(modules.id, questions.moduleId))
    .innerJoin(topics, eq(topics.id, modules.topicId))
    .where(and(...where));
  const [{ n: total }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(modules, eq(modules.id, questions.moduleId))
    .innerJoin(topics, eq(topics.id, modules.topicId))
    .where(and(...where));

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(filters.page ?? 1) || 1));
  const rows = await base
    .orderBy(asc(topics.order), asc(modules.number), asc(questions.difficulty), asc(questions.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows as BankQuestion[], total, page, pageSize, pageCount };
}

/**
 * Questions by id, in the order asked, for previewing a homework's auto-marked items.
 * Unpublished or unknown ids are left out rather than leaked.
 */
export async function questionPreviews(db: Db, actor: Actor, ids: string[]): Promise<BankQuestion[]> {
  assertTeacher(actor);
  const unique = [...new Set(ids)];
  if (unique.length > MAX_PREVIEW_IDS) throw new ValidationError("Too many questions to preview.");
  if (unique.length === 0) return [];
  const rows = await db
    .select(columns)
    .from(questions)
    .innerJoin(modules, eq(modules.id, questions.moduleId))
    .innerJoin(topics, eq(topics.id, modules.topicId))
    .where(and(inArray(questions.id, unique), eq(questions.status, "published")));
  const byId = new Map(rows.map((r) => [r.id, r as BankQuestion]));
  return unique.flatMap((id) => byId.get(id) ?? []);
}

export type ModuleCoverage = { total: number; easy: number; medium: number; hard: number };

/** Published questions per chapter, split by difficulty. Chapters with no questions are absent. */
export async function questionCoverage(db: Db, actor: Actor): Promise<Map<string, ModuleCoverage>> {
  assertTeacher(actor);
  const rows = await db
    .select({ moduleId: questions.moduleId, difficulty: questions.difficulty, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(eq(questions.status, "published"))
    .groupBy(questions.moduleId, questions.difficulty);
  const out = new Map<string, ModuleCoverage>();
  for (const r of rows) {
    if (!r.moduleId) continue;
    const c = out.get(r.moduleId) ?? { total: 0, easy: 0, medium: 0, hard: 0 };
    c.total += r.n;
    if (r.difficulty <= 1) c.easy += r.n;
    else if (r.difficulty === 2) c.medium += r.n;
    else c.hard += r.n;
    out.set(r.moduleId, c);
  }
  return out;
}
