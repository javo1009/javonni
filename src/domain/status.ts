import { isProficientNow, MASTERY_CONFIG, type MasteryState } from "./mastery";

export type LosStatus = "not_started" | "studied" | "practiced" | "proficient" | "review_due";

export const LOS_STATUS_ORDER: LosStatus[] = ["not_started", "studied", "practiced", "proficient", "review_due"];

export const LOS_STATUS_LABEL: Record<LosStatus, string> = {
  not_started: "Not started",
  studied: "Studied",
  practiced: "Practiced",
  proficient: "Proficient",
  review_due: "Review due",
};

const DAY_MS = 86_400_000;

/** Pure status rule. `studied` is the reading-task flag for the LOS's module. */
export function deriveLosStatus(studied: boolean, state: MasteryState | null, nowMs: number): LosStatus {
  const s = state;
  const attempts = s?.attempts ?? 0;
  if (s && s.everProficient) {
    const stale = s.lastAt !== null && (nowMs - s.lastAt) / DAY_MS > MASTERY_CONFIG.reviewIntervalDays;
    if (!isProficientNow(s, nowMs) || stale) return "review_due";
    return "proficient";
  }
  if (s && isProficientNow(s, nowMs)) return "proficient";
  if (attempts >= MASTERY_CONFIG.practicedAttempts) return "practiced";
  if (studied || attempts > 0) return "studied";
  return "not_started";
}

/** Coverage = LOS studied or beyond; proficiency = LOS currently proficient. */
export function coverageStats(statuses: LosStatus[]) {
  const total = statuses.length;
  const covered = statuses.filter((s) => s !== "not_started").length;
  const proficient = statuses.filter((s) => s === "proficient").length;
  const reviewDue = statuses.filter((s) => s === "review_due").length;
  return {
    total,
    covered,
    proficient,
    reviewDue,
    coveragePct: total ? covered / total : 0,
    proficiencyPct: total ? proficient / total : 0,
  };
}
