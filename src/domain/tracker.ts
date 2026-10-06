// Pure study-tracker engine, modelled on the Level I dashboard sample (docs/cfa-platform/TRACKER-CONCEPT.md).
// Everything here is deterministic and framework-free: callers pass `today` and plain data.
//
// Reproduces the sample's behaviour (roadmap dates, pace, focus, next actions) and adds
// the study features: spaced-review queue, chapter-pace forecast, consistency/streaks,
// confidence calibration, exam-weighted coverage.

import { addDays, diffDays, eachDay, startOfWeek, type ISODate } from "./dates";

// ------------------------------------------------------------------ config
export const TRACKER = {
  /** Default exam date in the sample (editable per student). */
  defaultExamDate: "2027-02-18" as ISODate,
  defaultWeeklyMinutes: 600,
  /** Share of the runway (whole weeks) given to the first pass over the syllabus. 14 of 19 weeks in the sample. */
  firstPassShare: 0.72,
  /** Hours within this of plan count as "on pace". */
  paceToleranceHours: 2,
  /** Practice scores below this are "weak". */
  weakScore: 70,
  /** CFA Institute reports an average above this many study hours among successful candidates. */
  referenceHours: 300,
  /** Review a chapter this many days after reading it, then refresh periodically. */
  firstReviewDays: 3,
  refreshDays: 21,
  /** First and second full mocks, in days before the exam (24 Jan and 7 Feb for an 18 Feb exam). */
  mockDaysBeforeExam: [25, 11] as const,
  streakWindowWeeks: 12,
};

// ------------------------------------------------------------------- types
export type TopicRef = {
  id: string;
  name: string;
  weightMin: number;
  weightMax: number;
  /** Study order, 0-based. */
  order: number;
  /** Weeks of the first pass at the reference runway; scaled for other runways. */
  studyWeeks: number;
};

export type ModuleRef = {
  id: string;
  topicId: string;
  number: number;
  title: string;
};

export type Confidence = 1 | 2 | 3;

export type ChapterState = {
  read: boolean;
  practice: boolean;
  review: boolean;
  /** Practice score in percent, or null if none recorded. */
  accuracy: number | null;
  confidence: Confidence | null;
  /** Student-local dates; null when unknown (e.g. restored from a backup). */
  readOn: ISODate | null;
  reviewedOn: ISODate | null;
};

export const EMPTY_CHAPTER: ChapterState = {
  read: false,
  practice: false,
  review: false,
  accuracy: null,
  confidence: null,
  readOn: null,
  reviewedOn: null,
};

export type ChapterStatus = "not-started" | "in-progress" | "complete";

export const chapterStatus = (s: ChapterState): ChapterStatus =>
  s.read && s.practice && s.review
    ? "complete"
    : s.read || s.practice || s.review
      ? "in-progress"
      : "not-started";

export const weightLabel = (t: Pick<TopicRef, "weightMin" | "weightMax">) =>
  `${t.weightMin}–${t.weightMax}%`;
const weightMid = (t: Pick<TopicRef, "weightMin" | "weightMax">) =>
  (t.weightMin + t.weightMax) / 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const pct = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ----------------------------------------------------------------- roadmap
export type TopicWindow = { topicId: string; start: ISODate; end: ISODate };

export type Roadmap = {
  /** Monday of the plan-start week. */
  firstPassStart: ISODate;
  firstPassEnd: ISODate;
  reviewStart: ISODate;
  /** Last study day: the day before the exam. */
  lastStudyDay: ISODate;
  topics: TopicWindow[];
  /** Whole weeks between the first Monday and the exam. */
  weeks: number;
  /** Fewer weeks than topics, so topics get days rather than weeks. */
  tight: boolean;
};

/** Split `total` into integers proportional to `weights`, each at least `min`, summing to `total`. */
export function allocate(
  total: number,
  weights: number[],
  min: number,
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const base = Math.max(total, min * n);
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  const exact = weights.map((w) => ((sum ? w : 1) / sum) * base);
  const out = exact.map((e) => Math.max(min, Math.floor(e)));
  let diff = base - out.reduce((a, b) => a + b, 0);
  const byRemainder = (dir: 1 | -1) =>
    exact
      .map((e, i) => ({ i, r: (e - out[i]) * dir }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.i);
  while (diff > 0)
    for (const i of byRemainder(1))
      if (diff > 0) {
        out[i]++;
        diff--;
      }
  while (diff < 0) {
    const candidates = byRemainder(-1).filter((i) => out[i] > min);
    if (candidates.length === 0) break;
    for (const i of candidates)
      if (diff < 0 && out[i] > min) {
        out[i]--;
        diff++;
      }
  }
  return out;
}

/**
 * Topic-by-topic first-pass schedule, then a review and mock period up to the exam.
 * With the sample's inputs (start 6 Oct 2026, exam 18 Feb 2027, its 10 topics) it
 * reproduces the sample's dates exactly.
 */
export function buildRoadmap(input: {
  planStart: ISODate;
  examDate: ISODate;
  topics: TopicRef[];
}): Roadmap {
  const topics = [...input.topics].sort((a, b) => a.order - b.order);
  const firstPassStart = startOfWeek(input.planStart);
  const lastStudyDay = addDays(input.examDate, -1);
  const runwayDays = Math.max(0, diffDays(firstPassStart, input.examDate));
  const weeks = Math.floor(runwayDays / 7);
  const weights = topics.map((t) => Math.max(1, t.studyWeeks));

  const wantedWeeks = Math.round(weeks * TRACKER.firstPassShare);
  const weekly = wantedWeeks >= topics.length;
  let spans: number[]; // days per topic
  if (weekly) spans = allocate(wantedWeeks, weights, 1).map((w) => w * 7);
  else {
    const days = Math.max(
      topics.length,
      Math.floor(runwayDays * TRACKER.firstPassShare),
    );
    spans = allocate(days, weights, 1);
  }

  const windows: TopicWindow[] = [];
  let cursor = firstPassStart;
  for (const [i, t] of topics.entries()) {
    const start = cursor;
    const end = addDays(start, spans[i] - 1);
    windows.push({
      topicId: t.id,
      start: start > lastStudyDay ? lastStudyDay : start,
      end: end > lastStudyDay ? lastStudyDay : end,
    });
    cursor = addDays(end, 1);
  }
  const firstPassEnd = windows.length
    ? windows[windows.length - 1].end
    : firstPassStart;
  return {
    firstPassStart,
    firstPassEnd,
    reviewStart: addDays(firstPassEnd, 1),
    lastStudyDay,
    topics: windows,
    weeks,
    tight: !weekly,
  };
}

export function activeTopicWindow(
  roadmap: Roadmap,
  today: ISODate,
): TopicWindow | null {
  return roadmap.topics.find((w) => w.start <= today && w.end >= today) ?? null;
}

export type Phase = "before" | "first-pass" | "review" | "after";

export function phaseOf(roadmap: Roadmap, today: ISODate): Phase {
  if (today < roadmap.firstPassStart) return "before";
  if (today <= roadmap.firstPassEnd) return "first-pass";
  if (today <= roadmap.lastStudyDay) return "review";
  return "after";
}

// -------------------------------------------------------------------- pace
export type PaceStatus = "none" | "on-pace" | "ahead" | "behind";

export type Pace = {
  status: PaceStatus;
  totalHours: number;
  expectedHours: number;
  capacityHours: number;
  /** Logged minus expected, in hours. */
  deltaHours: number;
  loggedFraction: number;
  plannedFraction: number;
  message: string;
};

export const formatHours = (h: number) => String(round1(h));

export function paceMessage(status: PaceStatus, deltaHours: number): string {
  switch (status) {
    case "none":
      return "Log your first session to compare your study time with your weekly plan.";
    case "ahead":
      return `${formatHours(deltaHours)} hours ahead of your planned pace. Keep working through the current topic.`;
    case "on-pace":
      return "Your logged hours are close to plan. Use practice results to guide the next session.";
    case "behind":
      return `${formatHours(-deltaHours)} hours behind planned pace. Add a catch-up session or adjust the weekly target.`;
  }
}

/** Logged study time against a straight-line plan from the plan start to the exam. */
export function computePace(input: {
  planStart: ISODate;
  examDate: ISODate;
  today: ISODate;
  weeklyTargetHours: number;
  /** Minutes logged on each date (any range; only plan start..exam counts). */
  minutesByDate: Map<ISODate, number>;
}): Pace {
  const { planStart, examDate, today, weeklyTargetHours: target } = input;
  let loggedMinutes = 0;
  for (const [d, m] of input.minutesByDate)
    if (d >= planStart && d <= examDate) loggedMinutes += m;
  const total = loggedMinutes / 60;
  const planDays = Math.max(0, diffDays(planStart, examDate));
  const capacity = Math.max(1, (planDays / 7) * target);
  const elapsed = clamp(diffDays(planStart, today), 0, planDays);
  const expected = (elapsed / 7) * target;
  const delta = total - expected;
  let status: PaceStatus;
  if (total === 0) status = "none";
  else if (delta >= -TRACKER.paceToleranceHours)
    status = delta > TRACKER.paceToleranceHours ? "ahead" : "on-pace";
  else status = "behind";
  return {
    status,
    totalHours: total,
    expectedHours: expected,
    capacityHours: capacity,
    deltaHours: delta,
    loggedFraction: clamp(total / capacity, 0, 1),
    plannedFraction: clamp(expected / capacity, 0, 1),
    message: paceMessage(status, delta),
  };
}

export function hoursInRange(
  minutesByDate: Map<ISODate, number>,
  from: ISODate,
  to: ISODate,
): number {
  let m = 0;
  for (const [d, v] of minutesByDate) if (d >= from && d <= to) m += v;
  return m / 60;
}

export function weekBounds(today: ISODate): { start: ISODate; end: ISODate } {
  const start = startOfWeek(today);
  return { start, end: addDays(start, 6) };
}

// ---------------------------------------------------------------- progress
export type TopicProgress = {
  topicId: string;
  total: number;
  read: number;
  complete: number;
  /** Mean of recorded practice scores; null when none. */
  avgAccuracy: number | null;
  scored: number;
  weak: number;
};

export function topicProgress(
  topics: TopicRef[],
  modules: ModuleRef[],
  states: Map<string, ChapterState>,
): Map<string, TopicProgress> {
  const out = new Map<string, TopicProgress>();
  for (const t of topics)
    out.set(t.id, {
      topicId: t.id,
      total: 0,
      read: 0,
      complete: 0,
      avgAccuracy: null,
      scored: 0,
      weak: 0,
    });
  const sums = new Map<string, number>();
  for (const m of modules) {
    const p = out.get(m.topicId);
    if (!p) continue;
    const s = states.get(m.id) ?? EMPTY_CHAPTER;
    p.total++;
    if (s.read) p.read++;
    if (chapterStatus(s) === "complete") p.complete++;
    if (s.accuracy !== null) {
      p.scored++;
      sums.set(m.topicId, (sums.get(m.topicId) ?? 0) + s.accuracy);
      if (s.accuracy < TRACKER.weakScore) p.weak++;
    }
  }
  for (const [id, p] of out)
    if (p.scored) p.avgAccuracy = Math.round((sums.get(id) ?? 0) / p.scored);
  return out;
}

export type Totals = {
  total: number;
  read: number;
  complete: number;
  readPct: number;
  completePct: number;
  /** Exam-weight-averaged share of chapters read / fully reviewed, in percent. */
  weightedReadPct: number;
  weightedCompletePct: number;
};

export function totals(
  topics: TopicRef[],
  progress: Map<string, TopicProgress>,
): Totals {
  let total = 0;
  let read = 0;
  let complete = 0;
  let wSum = 0;
  let wRead = 0;
  let wComplete = 0;
  for (const t of topics) {
    const p = progress.get(t.id);
    if (!p || p.total === 0) continue;
    total += p.total;
    read += p.read;
    complete += p.complete;
    const w = weightMid(t);
    wSum += w;
    wRead += w * (p.read / p.total);
    wComplete += w * (p.complete / p.total);
  }
  return {
    total,
    read,
    complete,
    readPct: pct(read, total),
    completePct: pct(complete, total),
    weightedReadPct: wSum ? Math.round((wRead / wSum) * 100) : 0,
    weightedCompletePct: wSum ? Math.round((wComplete / wSum) * 100) : 0,
  };
}

// ----------------------------------------------- roadmap pace and forecast
export type ChapterPace = {
  expectedRead: number;
  actualRead: number;
  /** Positive: chapters behind the roadmap. Negative: ahead. */
  behindBy: number;
  /** Chapters read per week over the last three weeks, or null if the dates aren't known. */
  weeklyRate: number | null;
  forecast:
    | { finish: ISODate; verdict: "on-schedule" | "late" | "after-exam" }
    | { verdict: "done" | "unknown" };
};

/** Chapters the roadmap expects to be read by `today`: finished topics in full, the active topic pro rata. */
export function expectedChaptersRead(
  roadmap: Roadmap,
  progress: Map<string, TopicProgress>,
  today: ISODate,
): number {
  let expected = 0;
  for (const w of roadmap.topics) {
    const total = progress.get(w.topicId)?.total ?? 0;
    if (today > w.end) expected += total;
    else if (today >= w.start) {
      const days = diffDays(w.start, w.end) + 1;
      const elapsed = diffDays(w.start, today) + 1;
      expected += Math.floor((total * elapsed) / days);
    }
  }
  return expected;
}

export function computeChapterPace(input: {
  roadmap: Roadmap;
  progress: Map<string, TopicProgress>;
  states: Map<string, ChapterState>;
  today: ISODate;
}): ChapterPace {
  const { roadmap, progress, states, today } = input;
  const totalChapters = [...progress.values()].reduce((s, p) => s + p.total, 0);
  const actual = [...progress.values()].reduce((s, p) => s + p.read, 0);
  const expected = expectedChaptersRead(roadmap, progress, today);

  const since = addDays(today, -20);
  let recent = 0;
  let dated = 0;
  for (const s of states.values()) {
    if (!s.read) continue;
    if (s.readOn) {
      dated++;
      if (s.readOn >= since && s.readOn <= today) recent++;
    }
  }
  const weeklyRate = dated > 0 ? round1(recent / 3) : null;

  let forecast: ChapterPace["forecast"];
  if (totalChapters > 0 && actual >= totalChapters)
    forecast = { verdict: "done" };
  else if (!weeklyRate || weeklyRate <= 0) forecast = { verdict: "unknown" };
  else {
    const finish = addDays(
      today,
      Math.ceil(((totalChapters - actual) / weeklyRate) * 7),
    );
    forecast = {
      finish,
      verdict:
        finish <= roadmap.firstPassEnd
          ? "on-schedule"
          : finish <= roadmap.lastStudyDay
            ? "late"
            : "after-exam",
    };
  }
  return {
    expectedRead: expected,
    actualRead: actual,
    behindBy: expected - actual,
    weeklyRate,
    forecast,
  };
}

// -------------------------------------------------------------- spaced review
export type ReviewItem = {
  moduleId: string;
  title: string;
  topicId: string;
  kind: "first-review" | "refresh";
  /** Days past the due date (0 = due today). */
  overdueDays: number;
};

/**
 * Chapters due for review: read chapters not yet reviewed after `firstReviewDays`,
 * and reviewed chapters again after `refreshDays`. Chapters with unknown dates are skipped.
 */
export function reviewQueue(
  modules: ModuleRef[],
  states: Map<string, ChapterState>,
  today: ISODate,
  topicOrder: Map<string, number>,
): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const m of modules) {
    const s = states.get(m.id);
    if (!s || !s.read) continue;
    if (!s.review) {
      if (!s.readOn) continue; // unknown read date (e.g. restored backup): can't schedule
      const due = addDays(s.readOn, TRACKER.firstReviewDays);
      if (due <= today)
        out.push({
          moduleId: m.id,
          title: m.title,
          topicId: m.topicId,
          kind: "first-review",
          overdueDays: diffDays(due, today),
        });
    } else if (s.reviewedOn) {
      const due = addDays(s.reviewedOn, TRACKER.refreshDays);
      if (due <= today)
        out.push({
          moduleId: m.id,
          title: m.title,
          topicId: m.topicId,
          kind: "refresh",
          overdueDays: diffDays(due, today),
        });
    }
  }
  return out.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "first-review" ? -1 : 1) ||
      b.overdueDays - a.overdueDays ||
      (topicOrder.get(a.topicId) ?? 0) - (topicOrder.get(b.topicId) ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

// ------------------------------------------------------------- consistency
export type Consistency = {
  /** Consecutive study days ending today (or yesterday if nothing is logged yet today). */
  currentStreak: number;
  longestStreak: number;
  activeDays28: number;
  /** Weeks (Monday first), oldest first; each day has minutes and a 0-4 intensity level. */
  weeks: {
    date: ISODate;
    minutes: number;
    level: 0 | 1 | 2 | 3 | 4;
    future: boolean;
  }[][];
};

export function computeConsistency(
  minutesByDate: Map<ISODate, number>,
  today: ISODate,
  weeklyTargetHours: number,
): Consistency {
  const active = new Set(
    [...minutesByDate].filter(([, m]) => m > 0).map(([d]) => d),
  );
  let current = 0;
  let d: ISODate = active.has(today) ? today : addDays(today, -1);
  while (active.has(d)) {
    current++;
    d = addDays(d, -1);
  }

  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  for (const [i, date] of sorted.entries()) {
    run = i > 0 && diffDays(sorted[i - 1], date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const dailyTargetMin = (weeklyTargetHours * 60) / 7;
  const level = (m: number): 0 | 1 | 2 | 3 | 4 =>
    m <= 0
      ? 0
      : m < dailyTargetMin * 0.5
        ? 1
        : m < dailyTargetMin
          ? 2
          : m < dailyTargetMin * 1.75
            ? 3
            : 4;
  const first = addDays(
    startOfWeek(today),
    -7 * (TRACKER.streakWindowWeeks - 1),
  );
  const weeks = [];
  for (let w = 0; w < TRACKER.streakWindowWeeks; w++) {
    weeks.push(
      eachDay(addDays(first, w * 7), addDays(first, w * 7 + 6)).map((date) => {
        const minutes = minutesByDate.get(date) ?? 0;
        return { date, minutes, level: level(minutes), future: date > today };
      }),
    );
  }
  const from28 = addDays(today, -27);
  return {
    currentStreak: current,
    longestStreak: longest,
    activeDays28: [...active].filter((x) => x >= from28 && x <= today).length,
    weeks,
  };
}

// ------------------------------------------------------------- calibration
export type Calibration = {
  rated: number;
  /** Rated "solid" but scored below the weak threshold: likely blind spots. */
  overconfident: { moduleId: string; title: string; accuracy: number }[];
  /** Rated "shaky" but scored 80% or more: probably know it better than they think. */
  underconfident: { moduleId: string; title: string; accuracy: number }[];
};

export function calibration(
  modules: ModuleRef[],
  states: Map<string, ChapterState>,
): Calibration {
  const out: Calibration = { rated: 0, overconfident: [], underconfident: [] };
  for (const m of modules) {
    const s = states.get(m.id);
    if (!s || s.confidence === null) continue;
    out.rated++;
    if (s.accuracy === null) continue;
    if (s.confidence === 3 && s.accuracy < TRACKER.weakScore)
      out.overconfident.push({
        moduleId: m.id,
        title: m.title,
        accuracy: s.accuracy,
      });
    if (s.confidence === 1 && s.accuracy >= 80)
      out.underconfident.push({
        moduleId: m.id,
        title: m.title,
        accuracy: s.accuracy,
      });
  }
  return out;
}

// -------------------------------------------------------------------- mocks
export type MockStats = {
  count: number;
  best: number | null;
  latest: number | null;
  average: number | null;
  /** Latest minus the one before it; null with fewer than two results. */
  change: number | null;
};

export function mockStats(
  results: { date: ISODate; score: number }[],
): MockStats {
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0)
    return { count: 0, best: null, latest: null, average: null, change: null };
  const scores = sorted.map((r) => r.score);
  return {
    count: sorted.length,
    best: Math.max(...scores),
    latest: scores[scores.length - 1],
    average: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
    change:
      sorted.length > 1
        ? round1(scores[scores.length - 1] - scores[scores.length - 2])
        : null,
  };
}

/** Dates by which the first and second full mocks should be done. */
export function mockDeadlines(examDate: ISODate): [ISODate, ISODate] {
  return [
    addDays(examDate, -TRACKER.mockDaysBeforeExam[0]),
    addDays(examDate, -TRACKER.mockDaysBeforeExam[1]),
  ];
}

// -------------------------------------------------------------- next actions
export type NextAction = {
  title: string;
  detail: string;
  tab: "chapters" | "hours" | "mocks" | "overview";
};

export function nextActions(input: {
  roadmap: Roadmap;
  topics: TopicRef[];
  modules: ModuleRef[];
  states: Map<string, ChapterState>;
  today: ISODate;
  examDate: ISODate;
  mockCount: number;
  weekHours: number;
  weeklyTargetHours: number;
  review: ReviewItem[];
  formatDate: (d: ISODate) => string;
}): NextAction[] {
  const { roadmap, topics, modules, states, today } = input;
  const actions: NextAction[] = [];
  const active = activeTopicWindow(roadmap, today);
  const state = (id: string) => states.get(id) ?? EMPTY_CHAPTER;

  if (active) {
    const topic = topics.find((t) => t.id === active.topicId)!;
    const next = modules
      .filter((m) => m.topicId === topic.id)
      .sort((a, b) => a.number - b.number)
      .find((m) => !state(m.id).read);
    actions.push(
      next
        ? {
            title: "Read the next chapter",
            detail: next.title,
            tab: "chapters",
          }
        : {
            title: "Practice this topic",
            detail: `Revisit questions and review missed answers in ${topic.name}.`,
            tab: "chapters",
          },
    );
  } else
    actions.push({
      title: "Review your weakest chapter",
      detail: "Use chapter practice scores to choose what to revisit.",
      tab: "chapters",
    });

  if (input.review.length > 0) {
    const first = input.review[0];
    const more = input.review.length - 1;
    actions.push({
      title: `Review ${input.review.length} chapter${input.review.length === 1 ? "" : "s"} due`,
      detail: `${first.title}${more > 0 ? ` and ${more} more` : ""} · ${first.kind === "first-review" ? "first review" : "refresh"}`,
      tab: "chapters",
    });
  }

  const weak = modules
    .filter(
      (m) =>
        state(m.id).accuracy !== null &&
        (state(m.id).accuracy as number) < TRACKER.weakScore,
    )
    .sort(
      (a, b) =>
        (state(a.id).accuracy as number) - (state(b.id).accuracy as number),
    )[0];
  if (weak)
    actions.push({
      title: "Rework a weak area",
      detail: `${weak.title} · ${state(weak.id).accuracy}% practice score`,
      tab: "chapters",
    });

  if (today < input.examDate && input.mockCount < 2) {
    const [a, b] = mockDeadlines(input.examDate);
    actions.push({
      title: "Keep mocks on the calendar",
      detail: `First full mock by ${input.formatDate(a)}; second by ${input.formatDate(b)}.`,
      tab: "mocks",
    });
  }

  if (input.weekHours < input.weeklyTargetHours) {
    actions.push({
      title: "Finish this week's hours",
      detail: `${formatHours(input.weeklyTargetHours - input.weekHours)} hours remain against your target.`,
      tab: "hours",
    });
  }
  return actions.slice(0, 4);
}

// ------------------------------------------------------------------ focus
export type Focus =
  | {
      kind: "topic";
      topicId: string;
      chapterIds: string[];
      read: number;
      total: number;
      start: ISODate;
      end: ISODate;
    }
  | {
      kind: "review" | "upcoming";
      weakIds: string[];
      complete: number;
      total: number;
    };

/** What to work on right now: the topic the roadmap is in, or review/weak chapters outside it. */
export function focusModel(input: {
  roadmap: Roadmap;
  modules: ModuleRef[];
  states: Map<string, ChapterState>;
  today: ISODate;
}): Focus {
  const { roadmap, modules, states, today } = input;
  const active = activeTopicWindow(roadmap, today);
  if (active) {
    const chapters = modules
      .filter((m) => m.topicId === active.topicId)
      .sort((a, b) => a.number - b.number);
    return {
      kind: "topic",
      topicId: active.topicId,
      chapterIds: chapters.map((m) => m.id),
      read: chapters.filter((m) => states.get(m.id)?.read).length,
      total: chapters.length,
      start: active.start,
      end: active.end,
    };
  }
  const weakIds = modules
    .filter((m) => {
      const a = states.get(m.id)?.accuracy;
      return a !== null && a !== undefined && a < TRACKER.weakScore;
    })
    .slice(0, 5)
    .map((m) => m.id);
  return {
    kind: today > roadmap.firstPassEnd ? "review" : "upcoming",
    weakIds,
    complete: modules.filter(
      (m) => chapterStatus(states.get(m.id) ?? EMPTY_CHAPTER) === "complete",
    ).length,
    total: modules.length,
  };
}
