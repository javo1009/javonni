import { and, eq, inArray, sql } from "drizzle-orm";
import { attempts, moduleProgress, questions } from "@/db/schema";
import { TRACKER } from "@/domain/tracker";
import { assertStudent } from "./access";
import { getActiveCurriculum } from "./curriculum";
import { NotFoundError, ValidationError, type Actor, type Db } from "./types";

export type PracticeScope =
  | { kind: "module"; id: string }
  | { kind: "topic"; id: string }
  /** Chapters where the student's recorded score or platform results are weak. */
  | { kind: "weak" }
  | { kind: "mixed" };

/** What the client sees: never the answer key or explanation. */
export type PracticeQuestion = {
  id: string;
  stem: string;
  options: { key: string; text: string }[];
  difficulty: number;
  moduleId: string;
  moduleTitle: string;
  topicName: string;
};

export type AnswerResult = {
  correct: boolean;
  correctKey: string;
  explanation: string;
  moduleId: string | null;
  /** The student's running tally on this chapter's questions, including this answer. */
  tally: { attempts: number; correct: number } | null;
};

const PRACTICE_MODES = ["practice", "timed", "mock"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/**
 * Pick questions for a session. Prefers questions never answered or answered wrongly,
 * chapters with weak scores, and heavier-weighted topics; avoids ones answered in the last two days.
 */
export async function pickQuestions(db: Db, actor: Actor, scope: PracticeScope, count: number): Promise<PracticeQuestion[]> {
  assertStudent(actor);
  const n = Math.max(1, Math.min(30, Math.floor(count)));
  const cur = await getActiveCurriculum(db);

  let moduleIds: string[];
  switch (scope.kind) {
    case "module":
      if (!cur.moduleById.has(scope.id)) throw new NotFoundError("Unknown chapter.");
      moduleIds = [scope.id];
      break;
    case "topic":
      if (!cur.topicById.has(scope.id)) throw new NotFoundError("Unknown topic.");
      moduleIds = cur.modules.filter((m) => m.topicId === scope.id).map((m) => m.id);
      break;
    default:
      moduleIds = cur.modules.map((m) => m.id);
  }

  const rows = await db
    .select({ id: questions.id, stem: questions.stem, options: questions.options, difficulty: questions.difficulty, moduleId: questions.moduleId })
    .from(questions)
    .where(and(eq(questions.status, "published"), inArray(questions.moduleId, moduleIds)));
  if (rows.length === 0) throw new NotFoundError("There are no questions for that yet.");

  const history = await db
    .select({
      questionId: attempts.questionId,
      lastCorrect: sql<boolean>`(array_agg(${attempts.correct} order by ${attempts.createdAt} desc))[1]`,
      recent: sql<boolean>`bool_or(${attempts.createdAt} > now() - interval '2 days')`,
    })
    .from(attempts)
    .where(eq(attempts.studentId, actor.id))
    .groupBy(attempts.questionId);
  const seen = new Map(history.map((h) => [h.questionId, h]));
  const scores = new Map(
    (await db.select({ moduleId: moduleProgress.moduleId, accuracy: moduleProgress.accuracy }).from(moduleProgress).where(eq(moduleProgress.studentId, actor.id))).map((r) => [
      r.moduleId,
      r.accuracy,
    ]),
  );

  const score = (q: (typeof rows)[number]): number => {
    const h = seen.get(q.id);
    const acc = q.moduleId ? scores.get(q.moduleId) : null;
    const weak = acc !== null && acc !== undefined && acc < TRACKER.weakScore;
    const topic = q.moduleId ? cur.topicById.get(cur.moduleById.get(q.moduleId)!.topicId) : undefined;
    let s = 0;
    if (!h) s += 30;
    else if (h.lastCorrect === false) s += 20;
    if (h?.recent) s -= 60;
    if (weak) s += scope.kind === "weak" ? 60 : 25;
    else if (scope.kind === "weak") s -= 100;
    if (topic) s += (topic.weightMin + topic.weightMax) / 2 / 2;
    return s;
  };
  const ranked = rows.filter((q) => scope.kind !== "weak" || score(q) > -50).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  if (ranked.length === 0) throw new NotFoundError("No weak chapters with questions yet. Record some practice scores first.");

  // At most two per chapter on the first sweep, so a set spreads across chapters.
  const picked: typeof rows = [];
  const perModule = new Map<string, number>();
  for (const cap of [2, 99]) {
    for (const q of ranked) {
      if (picked.length >= n) break;
      if (picked.some((p) => p.id === q.id)) continue;
      const k = q.moduleId ?? "";
      if ((perModule.get(k) ?? 0) >= cap) continue;
      picked.push(q);
      perModule.set(k, (perModule.get(k) ?? 0) + 1);
    }
  }
  return picked.map((q) => {
    const m = cur.moduleById.get(q.moduleId!)!;
    return {
      id: q.id,
      stem: q.stem,
      options: q.options,
      difficulty: q.difficulty,
      moduleId: m.id,
      moduleTitle: m.title,
      topicName: cur.topicById.get(m.topicId)?.name ?? "",
    };
  });
}

type RecordInput = {
  questionId: string;
  chosenKey: string;
  timeMs?: number | null;
  mode: "practice" | "timed" | "mock" | "homework";
  assignmentId?: string | null;
};

/** Grade one answer and store the attempt. Used by practice and, with mode "homework", by homework. */
export async function recordAttempt(db: Db, actor: Actor, input: RecordInput, now = Date.now()): Promise<AnswerResult> {
  assertStudent(actor);
  const [q] = await db.select().from(questions).where(eq(questions.id, input.questionId)).limit(1);
  if (!q || q.status !== "published") throw new NotFoundError("Question not found.");
  if (!q.options.some((o) => o.key === input.chosenKey)) throw new ValidationError("That isn't one of the answer options.");
  const correct = input.chosenKey === q.correctKey;
  await db.insert(attempts).values({
    studentId: actor.id,
    questionId: q.id,
    moduleId: q.moduleId,
    chosenKey: input.chosenKey,
    correct,
    timeMs: input.timeMs ?? null,
    mode: input.mode,
    assignmentId: input.assignmentId ?? null,
    createdAt: new Date(now),
  });
  let tally: AnswerResult["tally"] = null;
  if (q.moduleId) {
    const [t] = await db
      .select({ n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${attempts.correct})::int` })
      .from(attempts)
      .where(and(eq(attempts.studentId, actor.id), eq(attempts.moduleId, q.moduleId)));
    tally = { attempts: t.n, correct: t.ok };
  }
  return { correct, correctKey: q.correctKey, explanation: q.explanation, moduleId: q.moduleId, tally };
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
