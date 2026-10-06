// "Am I on track?" assessment + recovery options. Pure; see PLAN.md §4.2 step 6.
// Options are suggestions: nothing is changed until the student picks one.

import { diffDays, type ISODate } from "./dates";

export type AssessItem = {
  date: ISODate;
  minutes: number;
  status: "todo" | "done" | "skipped";
  type: string;
};

export type ProgressState = "ahead" | "on_track" | "behind" | "at_risk";

export type RecoveryOption =
  | { kind: "add_time"; extraMinutesPerWeek: number; weeks: number; summary: string }
  | { kind: "drop_optional"; minutes: number; summary: string }
  | { kind: "review_exam_date"; summary: string };

export type Assessment = {
  state: ProgressState;
  /** Done minus due minutes up to today. Negative = behind. */
  deltaMinutes: number;
  dueMinutes: number;
  doneMinutes: number;
  /** Minutes still planned between tomorrow and the exam. */
  remainingMinutes: number;
  options: RecoveryOption[];
};

export const ASSESS_CONFIG = {
  aheadMinutes: 60,
  behindMinutes: 60,
  atRiskMinutes: 480,
  atRiskShare: 0.2,
  maxExtraPerWeek: 600,
  taperDays: 3,
};

const OPTIONAL_TYPES = new Set(["review", "quiz"]);

export function assessProgress(input: { today: ISODate; examDate: ISODate; items: AssessItem[] }): Assessment {
  const { today, examDate, items } = input;
  let due = 0;
  let done = 0;
  let remaining = 0;
  let optionalRemaining = 0;
  for (const it of items) {
    if (it.status === "done") done += it.minutes;
    // Past days are due in full; today's tasks only count once done, so nobody
    // starts the morning "behind" on work they still have the whole day to do.
    if (it.date < today || (it.date === today && it.status === "done")) due += it.minutes;
    else if (it.date > today && it.status === "todo") {
      remaining += it.minutes;
      if (OPTIONAL_TYPES.has(it.type)) optionalRemaining += it.minutes;
    }
  }
  const delta = done - due;
  const behind = Math.max(0, -delta);

  let state: ProgressState;
  if (delta >= ASSESS_CONFIG.aheadMinutes) state = "ahead";
  else if (behind < ASSESS_CONFIG.behindMinutes) state = "on_track";
  else if (behind >= ASSESS_CONFIG.atRiskMinutes || behind > ASSESS_CONFIG.atRiskShare * Math.max(1, remaining + behind))
    state = "at_risk";
  else state = "behind";

  const options: RecoveryOption[] = [];
  if (behind >= ASSESS_CONFIG.behindMinutes) {
    const daysLeft = Math.max(0, diffDays(today, examDate) - ASSESS_CONFIG.taperDays);
    const weeks = Math.max(1, Math.floor(daysLeft / 7));
    const extra = Math.ceil(behind / weeks / 15) * 15;
    if (daysLeft >= 7 && extra <= ASSESS_CONFIG.maxExtraPerWeek) {
      options.push({
        kind: "add_time",
        extraMinutesPerWeek: extra,
        weeks,
        summary: `Add about ${formatMinutes(extra)} per week for ${weeks} week${weeks === 1 ? "" : "s"} to catch up without cutting anything.`,
      });
    }
    if (optionalRemaining >= behind * 0.5) {
      const cut = Math.min(optionalRemaining, behind);
      options.push({
        kind: "drop_optional",
        minutes: cut,
        summary: `Skip about ${formatMinutes(cut)} of optional review and quizzes, and keep the core reading and practice.`,
      });
    }
    if (state === "at_risk") {
      options.push({
        kind: "review_exam_date",
        summary: "At this pace the plan is at risk. Talk to your teacher about moving to a later exam window.",
      });
    }
  }
  return { state, deltaMinutes: delta, dueMinutes: due, doneMinutes: done, remainingMinutes: remaining, options };
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
