import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { attempts, los, questionLos, questions } from "@/db/schema";
import { masteryOf } from "@/domain/mastery";
import { deriveLosStatus, type LosStatus } from "@/domain/status";
import { getActiveCurriculum } from "./curriculum";
import { applyAttemptToProgress, loadProgress } from "./progress";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db } from "./types";

export type PracticeScope =
  | { kind: "los"; id: string }
  | { kind: "module"; id: string }
  | { kind: "topic"; id: string }
  | { kind: "mixed" }
  | { kind: "review" };

/** What the client sees: never the answer key or explanation. */
export type PracticeQuestion = {
  id: string;
  stem: string;
  options: { key: string; text: string }[];
  difficulty: number;
  losId: string;
  losCode: string;
  topicName: string;
};

export type AnswerResult = {
  correct: boolean;
  correctKey: string;
  explanation: string;
  losId: string;
  losCode: string;
  status: LosStatus;
  mastery: number;
};

const PRACTICE_MODES = ["practice", "timed", "mock"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

function assertStudent(actor: Actor) {
  if (actor.role !== "student") throw new ForbiddenError("Only students can practise.");
}

/**
 * Pick questions for a session. Priority: LOS needing review, then never-attempted,
 * then lowest mastery. Questions the student just answered are de-prioritised.
 */
export async function pickQuestions(
  db: Db,
  actor: Actor,
  scope: PracticeScope,
  count: number,
  now = Date.now(),
): Promise<PracticeQuestion[]> {
  assertStudent(actor);
  const n = Math.max(1, Math.min(30, Math.floor(count)));
  const c = await getActiveCurriculum(db);

  let losIds: string[];
  switch (scope.kind) {
    case "los":
      if (!c.los.some((l) => l.id === scope.id)) throw new NotFoundError("Unknown learning objective.");
      losIds = [scope.id];
      break;
    case "module":
      losIds = c.modules.find((m) => m.id === scope.id)?.losIds ?? [];
      break;
    case "topic":
      losIds = c.los.filter((l) => c.topicByLos.get(l.id) === scope.id).map((l) => l.id);
      break;
    default:
      losIds = c.los.map((l) => l.id);
  }
  if (losIds.length === 0) throw new NotFoundError("Nothing to practise there yet.");

  const progress = (await loadProgress(db, [actor.id])).get(actor.id)!;
  const rows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      options: questions.options,
      difficulty: questions.difficulty,
      losId: questionLos.losId,
    })
    .from(questionLos)
    .innerJoin(questions, and(eq(questions.id, questionLos.questionId), eq(questions.status, "published")))
    .where(inArray(questionLos.losId, losIds));
  if (rows.length === 0) throw new NotFoundError("There are no questions for that scope yet.");

  const recent = await db
    .select({ questionId: attempts.questionId })
    .from(attempts)
    .where(and(eq(attempts.studentId, actor.id), sql`${attempts.createdAt} > now() - interval '2 days'`));
  const recentSet = new Set(recent.map((r) => r.questionId));

  const losById = new Map(c.los.map((l) => [l.id, l]));
  const topicName = new Map(c.topics.map((t) => [t.id, t.name]));
  const score = (r: (typeof rows)[number]): number => {
    const p = progress.get(r.losId);
    const status = deriveLosStatus(p?.studied ?? false, p?.state ?? null, now);
    const m = p && p.state.attempts > 0 ? masteryOf(p.state, now) : 0.5;
    let s = 0;
    if (scope.kind === "review") s += status === "review_due" ? 100 : status === "proficient" ? -50 : 0;
    s += !p || p.state.attempts === 0 ? 30 : 0;
    s += (1 - m) * 40;
    if (recentSet.has(r.id)) s -= 60;
    return s;
  };
  // Stable ordering: score desc, then id, then take at most 2 per LOS before repeating.
  const ranked = [...rows].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const picked: typeof rows = [];
  const perLos = new Map<string, number>();
  for (const cap of [2, 99]) {
    for (const r of ranked) {
      if (picked.length >= n) break;
      if (picked.some((p) => p.id === r.id)) continue;
      if ((perLos.get(r.losId) ?? 0) >= cap) continue;
      picked.push(r);
      perLos.set(r.losId, (perLos.get(r.losId) ?? 0) + 1);
    }
  }
  return picked.map((r) => {
    const l = losById.get(r.losId)!;
    return {
      id: r.id,
      stem: r.stem,
      options: r.options,
      difficulty: r.difficulty,
      losId: r.losId,
      losCode: l.code,
      topicName: topicName.get(c.topicByLos.get(r.losId)!) ?? "",
    };
  });
}

type RecordInput = {
  questionId: string;
  chosenKey: string;
  losId?: string;
  timeMs?: number | null;
  mode: "practice" | "timed" | "mock" | "homework";
  assignmentId?: string | null;
  openBook?: boolean;
};

/**
 * Grade one answer, store the attempt and update mastery. Used by practice and,
 * with mode "homework", by the homework service. Returns the full reveal.
 */
export async function recordAttempt(db: Db, actor: Actor, input: RecordInput, now = Date.now()): Promise<AnswerResult> {
  assertStudent(actor);
  const [q] = await db.select().from(questions).where(eq(questions.id, input.questionId)).limit(1);
  if (!q || q.status !== "published") throw new NotFoundError("Question not found.");
  if (!q.options.some((o) => o.key === input.chosenKey)) throw new ValidationError("That isn't one of the answer options.");

  const links = await db
    .select({ losId: questionLos.losId, isPrimary: questionLos.isPrimary })
    .from(questionLos)
    .where(eq(questionLos.questionId, q.id));
  if (links.length === 0) throw new NotFoundError("Question is not linked to a learning objective.");
  const link = input.losId ? links.find((l) => l.losId === input.losId) : (links.find((l) => l.isPrimary) ?? links[0]);
  if (!link) throw new ValidationError("Question does not belong to that learning objective.");

  const correct = input.chosenKey === q.correctKey;
  const difficulty = (q.difficulty === 1 || q.difficulty === 3 ? q.difficulty : 2) as 1 | 2 | 3;
  const context = input.mode === "homework" ? "homework" : input.mode === "practice" ? "practice" : "timed";

  const prog = await db.transaction(async (tx) => {
    await tx.insert(attempts).values({
      studentId: actor.id,
      questionId: q.id,
      losId: link.losId,
      chosenKey: input.chosenKey,
      correct,
      timeMs: input.timeMs ?? null,
      mode: input.mode,
      assignmentId: input.assignmentId ?? null,
      createdAt: new Date(now),
    });
    return applyAttemptToProgress(tx, actor.id, link.losId, { correct, difficulty, context, at: now, openBook: input.openBook });
  });

  const [l] = await db.select({ code: los.code }).from(los).where(eq(los.id, link.losId)).limit(1);
  return {
    correct,
    correctKey: q.correctKey,
    explanation: q.explanation,
    losId: link.losId,
    losCode: l.code,
    status: deriveLosStatus(prog.studied, prog.state, now),
    mastery: masteryOf(prog.state, now),
  };
}

/** Practice-session entry point: only non-homework modes are allowed here. */
export async function submitPracticeAnswer(
  db: Db,
  actor: Actor,
  input: { questionId: string; chosenKey: string; timeMs?: number | null; mode?: PracticeMode },
): Promise<AnswerResult> {
  const mode = input.mode ?? "practice";
  if (!PRACTICE_MODES.includes(mode)) throw new ValidationError("Unknown practice mode.");
  return recordAttempt(db, actor, { ...input, mode });
}

export async function questionsAnsweredToday(db: Db, studentId: string, dayStartMs: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .where(and(eq(attempts.studentId, studentId), sql`${attempts.createdAt} >= ${new Date(dayStartMs)}`, notInArray(attempts.mode, ["homework"])));
  return r.n;
}
