import { and, eq, inArray, sql } from "drizzle-orm";
import { losProgress } from "@/db/schema";
import { applyAttempt, masteryOf, newMasteryState, type AttemptContext, type MasteryState } from "@/domain/mastery";
import { computeReadiness, type Readiness } from "@/domain/readiness";
import { coverageStats, deriveLosStatus, type LosStatus } from "@/domain/status";
import type { Curriculum } from "./curriculum";
import type { Db } from "./types";

export type Prog = { state: MasteryState; studied: boolean };
type Row = typeof losProgress.$inferSelect;

export function rowToProg(r: Row): Prog {
  return {
    studied: r.studied,
    state: {
      alpha: r.alpha,
      beta: r.beta,
      lastAt: r.lastAt ? r.lastAt.getTime() : null,
      activeDays: r.activeDays,
      lastDay: r.lastDay,
      attempts: r.attempts,
      everProficient: r.everProficient,
    },
  };
}

/** progress rows for the given students, grouped student -> LOS. */
export async function loadProgress(db: Db, studentIds: string[]): Promise<Map<string, Map<string, Prog>>> {
  const out = new Map<string, Map<string, Prog>>();
  for (const id of studentIds) out.set(id, new Map());
  if (studentIds.length === 0) return out;
  const rows = await db.select().from(losProgress).where(inArray(losProgress.studentId, studentIds));
  for (const r of rows) out.get(r.studentId)!.set(r.losId, rowToProg(r));
  return out;
}

export type StudentSnapshot = {
  statusByLos: Map<string, LosStatus>;
  masteryByLos: Map<string, number>;
  readiness: Readiness;
  coverage: ReturnType<typeof coverageStats>;
  /** Topic id -> mean mastery 0..1 (unseen LOS count as 0), plus coverage per topic. */
  topicStats: Map<string, { mastery: number; coveragePct: number; proficiencyPct: number; losCount: number; belowFloor: boolean }>;
};

export function buildSnapshot(c: Curriculum, progress: Map<string, Prog>, nowMs: number): StudentSnapshot {
  const states = new Map<string, MasteryState>();
  for (const [id, p] of progress) states.set(id, p.state);
  const statusByLos = new Map<string, LosStatus>();
  const masteryByLos = new Map<string, number>();
  for (const l of c.los) {
    const p = progress.get(l.id);
    statusByLos.set(l.id, deriveLosStatus(p?.studied ?? false, p?.state ?? null, nowMs));
    masteryByLos.set(l.id, p && p.state.attempts > 0 ? masteryOf(p.state, nowMs) : 0);
  }
  const readiness = computeReadiness(c.topics, c.modules, c.los, states, nowMs);
  const topicStats: StudentSnapshot["topicStats"] = new Map();
  for (const t of c.topics) {
    const ls = c.los.filter((l) => c.topicByLos.get(l.id) === t.id);
    const sts = ls.map((l) => statusByLos.get(l.id)!);
    const cov = coverageStats(sts);
    const tr = readiness.topics.find((x) => x.topicId === t.id);
    topicStats.set(t.id, {
      mastery: tr?.mastery ?? 0,
      coveragePct: cov.coveragePct,
      proficiencyPct: cov.proficiencyPct,
      losCount: ls.length,
      belowFloor: tr?.belowFloor ?? false,
    });
  }
  return { statusByLos, masteryByLos, readiness, coverage: coverageStats([...statusByLos.values()]), topicStats };
}

/** Apply one graded answer to the (student, LOS) progress row, serialised per pair. */
export async function applyAttemptToProgress(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  studentId: string,
  losId: string,
  a: { correct: boolean; difficulty: 1 | 2 | 3; context: AttemptContext; at: number; openBook?: boolean },
): Promise<Prog> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${studentId + ":" + losId}, 0))`);
  const [row] = await tx
    .select()
    .from(losProgress)
    .where(and(eq(losProgress.studentId, studentId), eq(losProgress.losId, losId)))
    .limit(1);
  const prev = row ? rowToProg(row) : { state: newMasteryState(), studied: false };
  const next = applyAttempt(prev.state, a);
  const values = {
    studentId,
    losId,
    alpha: next.alpha,
    beta: next.beta,
    lastAt: next.lastAt === null ? null : new Date(next.lastAt),
    activeDays: next.activeDays,
    lastDay: next.lastDay,
    attempts: next.attempts,
    everProficient: next.everProficient,
    studied: prev.studied,
    updatedAt: new Date(),
  };
  await tx
    .insert(losProgress)
    .values(values)
    .onConflictDoUpdate({ target: [losProgress.studentId, losProgress.losId], set: values });
  return { state: next, studied: prev.studied };
}
