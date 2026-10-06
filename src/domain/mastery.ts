// Decayed Beta mastery model, one state per (student, LOS).
// See docs/cfa-platform/PLAN.md §4.3.

import { formatDate, type ISODate } from "./dates";

export type MasteryState = {
  alpha: number;
  beta: number;
  /** Epoch ms of the last attempt, or null if never attempted. */
  lastAt: number | null;
  /** Number of distinct calendar days with at least one attempt. */
  activeDays: number;
  lastDay: ISODate | null;
  attempts: number;
  /** Latched once the LOS first reaches proficient; drives review_due. */
  everProficient: boolean;
};

export type AttemptContext = "practice" | "timed" | "mock" | "homework";

export type AttemptInput = {
  correct: boolean;
  /** 1 easy, 2 medium, 3 hard. */
  difficulty: 1 | 2 | 3;
  context: AttemptContext;
  at: number;
  /** Open-book homework counts for less. */
  openBook?: boolean;
};

export const MASTERY_CONFIG = {
  halfLifeDays: 21,
  difficultyWeight: { 1: 0.5, 2: 1, 3: 1.5 } as const,
  timedMultiplier: 1.2,
  openBookMultiplier: 0.6,
  practicedAttempts: 4,
  proficientMastery: 0.75,
  proficientDays: 2,
  reviewIntervalDays: 21,
  /** Mastery below this in a topic gets flagged regardless of overall readiness. */
  topicFloor: 0.5,
};

const DAY_MS = 86_400_000;

export const newMasteryState = (): MasteryState => ({
  alpha: 1,
  beta: 1,
  lastAt: null,
  activeDays: 0,
  lastDay: null,
  attempts: 0,
  everProficient: false,
});

/** Evidence decays toward the Beta(1,1) prior with the configured half-life. */
export function decayedCounts(s: MasteryState, nowMs: number, halfLifeDays = MASTERY_CONFIG.halfLifeDays) {
  if (s.lastAt === null) return { alpha: s.alpha, beta: s.beta };
  const dt = Math.max(0, nowMs - s.lastAt) / DAY_MS;
  const f = Math.pow(2, -dt / halfLifeDays);
  return { alpha: 1 + (s.alpha - 1) * f, beta: 1 + (s.beta - 1) * f };
}

export function masteryOf(s: MasteryState, nowMs: number): number {
  const { alpha, beta } = decayedCounts(s, nowMs);
  return alpha / (alpha + beta);
}

/** Effective amount of evidence (alpha + beta - 2) after decay. */
export function evidenceOf(s: MasteryState, nowMs: number): number {
  const { alpha, beta } = decayedCounts(s, nowMs);
  return alpha + beta - 2;
}

export function varianceOf(s: MasteryState, nowMs: number): number {
  const { alpha, beta } = decayedCounts(s, nowMs);
  const n = alpha + beta;
  return (alpha * beta) / (n * n * (n + 1));
}

export function attemptWeight(a: Pick<AttemptInput, "difficulty" | "context" | "openBook">): number {
  let w: number = MASTERY_CONFIG.difficultyWeight[a.difficulty];
  if (a.context === "timed" || a.context === "mock") w *= MASTERY_CONFIG.timedMultiplier;
  if (a.context === "homework" && a.openBook) w *= MASTERY_CONFIG.openBookMultiplier;
  return w;
}

export function isProficientNow(s: MasteryState, nowMs: number): boolean {
  return (
    s.attempts >= MASTERY_CONFIG.practicedAttempts &&
    s.activeDays >= MASTERY_CONFIG.proficientDays &&
    masteryOf(s, nowMs) >= MASTERY_CONFIG.proficientMastery
  );
}

export function applyAttempt(s: MasteryState, a: AttemptInput): MasteryState {
  const { alpha, beta } = decayedCounts(s, a.at);
  const w = attemptWeight(a);
  const day = formatDate(a.at);
  const next: MasteryState = {
    alpha: alpha + (a.correct ? w : 0),
    beta: beta + (a.correct ? 0 : w),
    lastAt: a.at,
    activeDays: s.activeDays + (s.lastDay === day ? 0 : 1),
    lastDay: day,
    attempts: s.attempts + 1,
    everProficient: s.everProficient,
  };
  if (isProficientNow(next, a.at)) next.everProficient = true;
  return next;
}
