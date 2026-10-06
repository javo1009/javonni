// Pure view logic for the student tracker screens: filtering, optimistic patches, form validation,
// chart geometry and small wording helpers. No React, no server code, so it is unit-tested directly.

import { addDays, diffDays, isValidDate, type ISODate } from "@/domain/dates";
import { TRACKER, chapterStatus } from "@/domain/tracker";
import type {
  ChapterPatch,
  ChapterView,
  TopicView,
  TrackerSnapshot,
} from "@/services/tracker";
import { formatShortDate } from "./tracker-dates";

// ------------------------------------------------------------------ filters
export type StatusFilter =
  | "all"
  | "unread"
  | "in-progress"
  | "done"
  | "due"
  | "weak";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "unread", label: "Not read yet" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Complete" },
  { value: "due", label: "Due for review" },
  { value: "weak", label: `Practice below ${TRACKER.weakScore}%` },
];

export type ChapterFilter = {
  query: string;
  topicId: string;
  status: StatusFilter;
};
export const NO_FILTER: ChapterFilter = {
  query: "",
  topicId: "",
  status: "all",
};

export const isFiltered = (f: ChapterFilter) =>
  f.query.trim() !== "" || f.topicId !== "" || f.status !== "all";

/** Whether a chapter passes the filter. `topicName` is matched by the search box along with the title and number. */
export function matchesFilter(
  ch: ChapterView,
  topicName: string,
  f: ChapterFilter,
): boolean {
  if (f.topicId && ch.topicId !== f.topicId) return false;
  const q = f.query.trim().toLowerCase();
  if (
    q &&
    !(
      ch.title.toLowerCase().includes(q) ||
      topicName.toLowerCase().includes(q) ||
      String(ch.number) === q
    )
  )
    return false;
  switch (f.status) {
    case "all":
      return true;
    case "unread":
      return !ch.state.read;
    case "in-progress":
      return ch.status === "in-progress";
    case "done":
      return ch.status === "complete";
    case "due":
      return ch.reviewDue !== null;
    case "weak":
      return (
        ch.state.accuracy !== null && ch.state.accuracy < TRACKER.weakScore
      );
  }
}

/** Filter from URL search params; unknown topics or statuses fall back to "no filter". */
export function parseFilterParams(
  params: Record<string, string | string[] | undefined>,
  topics: Pick<TopicView, "id">[],
): ChapterFilter {
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const topic = one(params.topic);
  const status = one(params.status) as StatusFilter;
  return {
    query: one(params.q).slice(0, 80),
    topicId: topics.some((t) => t.id === topic) ? topic : "",
    status: STATUS_FILTERS.some((s) => s.value === status) ? status : "all",
  };
}

/** Query string (without "?") for a filter, omitting defaults. */
export function filterToQuery(f: ChapterFilter): string {
  const p = new URLSearchParams();
  if (f.topicId) p.set("topic", f.topicId);
  if (f.status !== "all") p.set("status", f.status);
  if (f.query.trim()) p.set("q", f.query.trim());
  return p.toString();
}

export type ChapterCounts = {
  total: number;
  read: number;
  complete: number;
  due: number;
  weak: number;
  inProgress: number;
};

export function chapterCounts(
  chapters: Pick<ChapterView, "state" | "status" | "reviewDue">[],
): ChapterCounts {
  const out: ChapterCounts = {
    total: chapters.length,
    read: 0,
    complete: 0,
    due: 0,
    weak: 0,
    inProgress: 0,
  };
  for (const c of chapters) {
    if (c.state.read) out.read++;
    if (c.status === "complete") out.complete++;
    if (c.status === "in-progress") out.inProgress++;
    if (c.reviewDue) out.due++;
    if (c.state.accuracy !== null && c.state.accuracy < TRACKER.weakScore)
      out.weak++;
  }
  return out;
}

export type TopicCounts = { total: number; read: number; complete: number };

/** Per-topic read/complete counts from the current (possibly optimistic) chapter list. */
export function topicCounts(
  chapters: Pick<ChapterView, "topicId" | "state" | "status">[],
): Map<string, TopicCounts> {
  const out = new Map<string, TopicCounts>();
  for (const c of chapters) {
    const t = out.get(c.topicId) ?? { total: 0, read: 0, complete: 0 };
    t.total++;
    if (c.state.read) t.read++;
    if (c.status === "complete") t.complete++;
    out.set(c.topicId, t);
  }
  return out;
}

// ------------------------------------------------------- optimistic patches
/** Mirror of the service's `updateChapter` rules, applied to the client copy while the action is in flight. */
export function applyChapterPatch(
  ch: ChapterView,
  patch: ChapterPatch,
  today: ISODate,
): ChapterView {
  const s = { ...ch.state };
  if (patch.read !== undefined) {
    s.read = patch.read;
    s.readOn = patch.read ? (ch.state.read ? ch.state.readOn : today) : null;
  }
  if (patch.practice !== undefined) s.practice = patch.practice;
  if (patch.review !== undefined) {
    s.review = patch.review;
    s.reviewedOn = patch.review
      ? ch.state.review
        ? ch.state.reviewedOn
        : today
      : null;
  }
  if (patch.reviewedToday) {
    s.review = true;
    s.reviewedOn = today;
  }
  if (patch.accuracy !== undefined)
    s.accuracy = patch.accuracy === null ? null : Math.round(patch.accuracy);
  if (patch.confidence !== undefined) s.confidence = patch.confidence;
  // Marking something reviewed answers the review prompt; un-reading a chapter removes it from the queue.
  const answered =
    patch.reviewedToday || patch.review === true || patch.read === false;
  return {
    ...ch,
    state: s,
    status: chapterStatus(s),
    reviewDue: answered ? null : ch.reviewDue,
  };
}

// -------------------------------------------------------------- validation
/** Exam dates the 2027 curriculum allows (mirrors the settings rule in services/tracker). */
export const EXAM_DATE_MIN: ISODate = "2027-02-01";
export const EXAM_DATE_MAX: ISODate = "2027-12-31";
export const SESSION_MIN_MINUTES = 15;
export const SESSION_MAX_MINUTES = 24 * 60;
export const NOTE_MAX = 300;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateSettings(
  input: { examDate: string; hours: string },
  today: ISODate,
): FieldErrors<"examDate" | "hours"> {
  const errors: FieldErrors<"examDate" | "hours"> = {};
  if (!isValidDate(input.examDate))
    errors.examDate = "Enter a valid exam date.";
  else if (input.examDate < EXAM_DATE_MIN || input.examDate > EXAM_DATE_MAX)
    errors.examDate =
      "The 2027 curriculum applies to exams from February to December 2027.";
  else if (diffDays(today, input.examDate) < 7)
    errors.examDate = "The exam date must be at least a week away.";
  const h = Number(input.hours);
  if (input.hours.trim() === "" || !Number.isFinite(h) || h < 1 || h > 80)
    errors.hours = "Weekly hours must be between 1 and 80.";
  return errors;
}

/** Whole minutes from the hours + minutes fields; blank counts as 0, anything non-numeric or negative is NaN. */
export function toMinutes(hours: string, minutes: string): number {
  const part = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const h = part(hours);
  const m = part(minutes);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return NaN;
  return Math.round(h * 60 + m);
}

export function validateSession(
  input: { date: string; minutes: number; topic: string; note: string },
  today: ISODate,
  topics: string[],
): FieldErrors<"date" | "duration" | "topic" | "note"> {
  const errors: FieldErrors<"date" | "duration" | "topic" | "note"> = {};
  if (!isValidDate(input.date)) errors.date = "Enter a valid date.";
  else if (input.date > today)
    errors.date = "You can't log study time in the future.";
  else if (diffDays(input.date, today) > 730)
    errors.date = "That date is too far in the past.";
  if (!Number.isFinite(input.minutes))
    errors.duration = "Enter the time studied.";
  else if (input.minutes < SESSION_MIN_MINUTES)
    errors.duration = `Log at least ${SESSION_MIN_MINUTES} minutes per session.`;
  else if (input.minutes > SESSION_MAX_MINUTES)
    errors.duration = "A session can't be longer than 24 hours.";
  if (!topics.includes(input.topic))
    errors.topic = "Choose a topic from the list.";
  if (input.note.length > NOTE_MAX)
    errors.note = `Keep the note under ${NOTE_MAX} characters.`;
  return errors;
}

export function validateMock(
  input: { date: string; score: string; note: string },
  today: ISODate,
): FieldErrors<"date" | "score" | "note"> {
  const errors: FieldErrors<"date" | "score" | "note"> = {};
  if (!isValidDate(input.date)) errors.date = "Enter a valid date.";
  else if (input.date > today)
    errors.date = "A mock result can't be dated in the future.";
  const s = Number(input.score);
  if (input.score.trim() === "" || !Number.isFinite(s) || s < 0 || s > 100)
    errors.score = "Enter a score from 0 to 100.";
  if (input.note.length > NOTE_MAX)
    errors.note = `Keep the note under ${NOTE_MAX} characters.`;
  return errors;
}

/** A practice score typed into a chapter row: "" clears it; otherwise a whole number 0 to 100. */
export function parseScore(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    return { ok: false, error: "Enter a score from 0 to 100." };
  return { ok: true, value: Math.round(n) };
}

// ------------------------------------------------------------------- charts
/** Round a maximum up to a tidy axis (1, 2, 5 × 10ⁿ steps) and list the tick values from 0. */
export function niceTicks(
  max: number,
  count = 4,
): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step)
    ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks };
}

export type BarRect = { x: number; y: number; width: number; height: number };

/** Evenly spaced vertical bars inside a plot area; bars grow from the bottom edge (zero baseline). */
export function layoutBars(
  values: number[],
  max: number,
  plot: { x: number; y: number; width: number; height: number },
  gapRatio = 0.3,
): BarRect[] {
  const n = values.length;
  if (n === 0 || max <= 0) return [];
  const slot = plot.width / n;
  const width = slot * (1 - gapRatio);
  return values.map((v, i) => {
    const h = Math.max(0, Math.min(1, v / max)) * plot.height;
    return {
      x: plot.x + slot * i + (slot - width) / 2,
      y: plot.y + plot.height - h,
      width,
      height: h,
    };
  });
}

/** Show every nth label so at most `maxLabels` appear. */
export const labelStep = (count: number, maxLabels: number) =>
  Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));

/** Hours as the dashboard writes them: one decimal at most, no trailing ".0". */
export const fmtHours = (h: number) => String(Math.round(h * 10) / 10);

// ---------------------------------------------------------------- wording
type HeadlineInput = Pick<
  TrackerSnapshot,
  "daysLeft" | "examDate" | "phase"
> & { pace: Pick<TrackerSnapshot["pace"], "status"> };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const monthName = (d: ISODate) =>
  MONTHS[Number(d.slice(5, 7)) - 1] ?? "";

export function overviewHeadline(s: HeadlineInput): string {
  if (s.daysLeft <= 0) return "Exam day. You've done the work.";
  if (s.phase === "before")
    return `Get ready to start for ${monthName(s.examDate)}.`;
  switch (s.pace.status) {
    case "none":
      return "Let's log your first session.";
    case "behind":
      return "Let's get you back on pace.";
    case "ahead":
      return `You're ahead for ${monthName(s.examDate)}.`;
    default:
      return `Stay on course for ${monthName(s.examDate)}.`;
  }
}

export function phaseLabel(phase: TrackerSnapshot["phase"]): string {
  return {
    before: "Plan starts soon",
    "first-pass": "First pass through the syllabus",
    review: "Review and mock exams",
    after: "Exam date has passed",
  }[phase];
}

/** "Mon 5 Oct to Sun 11 Oct" style range for a week. */
export const weekRange = (start: ISODate, end: ISODate) =>
  `${formatShortDate(start)}–${formatShortDate(end)}`;

export type DeadlineState = {
  label: string;
  tone: "good" | "warn" | "neutral";
  done: boolean;
};

/** Where each mock deadline stands, given how many mocks are recorded (the n-th mock satisfies the n-th deadline). */
export function mockDeadlineStates(
  deadlines: readonly ISODate[],
  mockCount: number,
  today: ISODate,
): DeadlineState[] {
  return deadlines.map((d, i) => {
    if (mockCount > i) return { label: "Recorded", tone: "good", done: true };
    const left = diffDays(today, d);
    if (left < 0)
      return {
        label: `${-left} day${left === -1 ? "" : "s"} overdue`,
        tone: "warn",
        done: false,
      };
    if (left === 0) return { label: "Due today", tone: "warn", done: false };
    return {
      label: `Due in ${left} day${left === 1 ? "" : "s"}`,
      tone: "neutral",
      done: false,
    };
  });
}

/** Direction of the latest mock against the one before it; a move under one point reads as flat. */
export function mockTrend(change: number | null): {
  dir: "up" | "down" | "flat" | "none";
  label: string;
} {
  if (change === null)
    return { dir: "none", label: "Add a second mock to see a trend" };
  if (Math.abs(change) < 1)
    return { dir: "flat", label: "Level with the previous mock" };
  const pts = `${fmtHours(Math.abs(change))} point${Math.abs(change) === 1 ? "" : "s"}`;
  return change > 0
    ? { dir: "up", label: `Up ${pts} on the previous mock` }
    : { dir: "down", label: `Down ${pts} on the previous mock` };
}

/** Plain-language summary of the finish forecast (verdict, date, and chapters per week needed). */
export function forecastSummary(
  pace: TrackerSnapshot["chapterPace"],
  roadmap: Pick<TrackerSnapshot["roadmap"], "firstPassEnd" | "lastStudyDay">,
  chaptersLeft: number,
  today: ISODate,
  examDate: ISODate,
): {
  tone: "good" | "warn" | "neutral";
  headline: string;
  detail: string;
  neededPerWeek: number | null;
} {
  const f = pace.forecast;
  const weeksToFirstPassEnd = Math.max(
    1,
    diffDays(today, roadmap.firstPassEnd) / 7,
  );
  const needed =
    chaptersLeft > 0
      ? Math.round((chaptersLeft / weeksToFirstPassEnd) * 10) / 10
      : 0;
  const neededPerWeek =
    today > roadmap.firstPassEnd
      ? Math.round(
          (chaptersLeft / Math.max(1, diffDays(today, examDate) / 7)) * 10,
        ) / 10
      : needed;
  if (f.verdict === "done")
    return {
      tone: "good",
      headline: "Every chapter read",
      detail: "Spend the rest of your time on practice, review and mocks.",
      neededPerWeek: 0,
    };
  if (!("finish" in f))
    return {
      tone: "neutral",
      headline: "Forecast starts once you tick chapters",
      detail: `Read a few chapters over the next weeks and this will project your finish date. About ${fmtHours(neededPerWeek)} chapters a week finishes the first pass on ${formatShortDate(roadmap.firstPassEnd)}.`,
      neededPerWeek,
    };
  const rate =
    pace.weeklyRate === null
      ? ""
      : ` at your recent ${fmtHours(pace.weeklyRate)} chapters a week`;
  if (f.verdict === "on-schedule")
    return {
      tone: "good",
      headline: `Finish by ${formatShortDate(f.finish)}`,
      detail: `On schedule${rate}: that's before the first pass ends on ${formatShortDate(roadmap.firstPassEnd)}.`,
      neededPerWeek,
    };
  if (f.verdict === "late")
    return {
      tone: "warn",
      headline: `Finish by ${formatShortDate(f.finish)}`,
      detail: `Later than the roadmap's ${formatShortDate(roadmap.firstPassEnd)}${rate}, but before the exam. About ${fmtHours(neededPerWeek)} chapters a week would close the gap.`,
      neededPerWeek,
    };
  const lately =
    pace.weeklyRate === null
      ? ""
      : `Only ${fmtHours(pace.weeklyRate)} chapters a week lately. `;
  return {
    tone: "warn",
    headline: `Finish ${formatShortDate(f.finish)}, after the exam`,
    detail: `${lately}You'd need about ${fmtHours(neededPerWeek)} chapters a week to finish the first pass by ${formatShortDate(roadmap.firstPassEnd)}.`,
    neededPerWeek,
  };
}

// ------------------------------------------------------------ study insights
export type UpcomingReview = {
  moduleId: string;
  title: string;
  topicId: string;
  kind: "first-review" | "refresh";
  due: ISODate;
  inDays: number;
};

/** Chapters that will come due for review in the next `days` days (tomorrow onwards), soonest first. */
export function upcomingReviews(
  chapters: Pick<
    ChapterView,
    "id" | "title" | "topicId" | "number" | "state" | "reviewDue"
  >[],
  today: ISODate,
  days = 7,
): UpcomingReview[] {
  const out: UpcomingReview[] = [];
  for (const c of chapters) {
    if (c.reviewDue || !c.state.read) continue;
    let due: ISODate | null = null;
    let kind: UpcomingReview["kind"] = "first-review";
    if (!c.state.review && c.state.readOn)
      due = addDays(c.state.readOn, TRACKER.firstReviewDays);
    else if (c.state.review && c.state.reviewedOn) {
      due = addDays(c.state.reviewedOn, TRACKER.refreshDays);
      kind = "refresh";
    }
    if (!due) continue;
    const inDays = diffDays(today, due);
    if (inDays >= 1 && inDays <= days)
      out.push({
        moduleId: c.id,
        title: c.title,
        topicId: c.topicId,
        kind,
        due,
        inDays,
      });
  }
  return out.sort(
    (a, b) => a.inDays - b.inDays || a.title.localeCompare(b.title),
  );
}

/** The topic with the most exam weight still unread: where reading next moves weighted coverage most. */
export function biggestWeightGap(
  topics: Pick<
    TopicView,
    "id" | "name" | "weightMin" | "weightMax" | "weightLabel"
  >[],
  counts: Map<string, TopicCounts>,
): {
  topic: (typeof topics)[number];
  read: number;
  total: number;
  unreadWeight: number;
} | null {
  let best: ReturnType<typeof biggestWeightGap> = null;
  for (const t of topics) {
    const c = counts.get(t.id);
    if (!c || c.total === 0 || c.read >= c.total) continue;
    const unreadWeight =
      ((t.weightMin + t.weightMax) / 2) * (1 - c.read / c.total);
    if (!best || unreadWeight > best.unreadWeight)
      best = { topic: t, read: c.read, total: c.total, unreadWeight };
  }
  return best;
}

/** Weakest chapters first: recorded practice score below the weak threshold, lowest score first. */
export function weakChapters<T extends Pick<ChapterView, "state" | "title">>(
  chapters: T[],
  limit = 5,
): T[] {
  return chapters
    .filter(
      (c) => c.state.accuracy !== null && c.state.accuracy < TRACKER.weakScore,
    )
    .sort(
      (a, b) =>
        (a.state.accuracy as number) - (b.state.accuracy as number) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
