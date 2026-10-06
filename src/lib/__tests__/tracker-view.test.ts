import { describe, expect, it } from "vitest";
import type { ChapterView, TrackerSnapshot } from "@/services/tracker";
import { EMPTY_CHAPTER, chapterStatus, type ChapterState } from "@/domain/tracker";
import {
  NO_FILTER,
  applyChapterPatch,
  biggestWeightGap,
  chapterCounts,
  filterToQuery,
  forecastSummary,
  fmtHours,
  isFiltered,
  labelStep,
  layoutBars,
  matchesFilter,
  mockDeadlineStates,
  mockTrend,
  niceTicks,
  overviewHeadline,
  parseFilterParams,
  parseScore,
  toMinutes,
  topicCounts,
  validateMock,
  validateSession,
  validateSettings,
  upcomingReviews,
  weakChapters,
} from "../tracker-view";

const chapter = (over: Partial<ChapterState> = {}, extra: Partial<ChapterView> = {}): ChapterView => {
  const state = { ...EMPTY_CHAPTER, ...over };
  return { id: "m1", number: 3, title: "Time Value of Money", topicId: "t1", state, status: chapterStatus(state), reviewDue: null, practice: null, ...extra };
};

describe("chapter filters", () => {
  it("matches search by title, topic name and number", () => {
    const c = chapter();
    expect(matchesFilter(c, "Quantitative Methods", { ...NO_FILTER, query: "money" })).toBe(true);
    expect(matchesFilter(c, "Quantitative Methods", { ...NO_FILTER, query: "quantitative" })).toBe(true);
    expect(matchesFilter(c, "Quantitative Methods", { ...NO_FILTER, query: "3" })).toBe(true);
    expect(matchesFilter(c, "Quantitative Methods", { ...NO_FILTER, query: "bonds" })).toBe(false);
  });

  it("filters by topic and status", () => {
    const unread = chapter();
    const reading = chapter({ read: true });
    const done = chapter({ read: true, practice: true, review: true });
    const due = chapter({ read: true }, { reviewDue: { kind: "first-review", overdueDays: 2 } });
    const weak = chapter({ accuracy: 55 });
    const ok = chapter({ accuracy: 70 });
    const f = (status: Parameters<typeof matchesFilter>[2]["status"]) => ({ ...NO_FILTER, status });
    expect(matchesFilter(unread, "", f("unread"))).toBe(true);
    expect(matchesFilter(reading, "", f("unread"))).toBe(false);
    expect(matchesFilter(reading, "", f("in-progress"))).toBe(true);
    expect(matchesFilter(done, "", f("done"))).toBe(true);
    expect(matchesFilter(done, "", f("in-progress"))).toBe(false);
    expect(matchesFilter(due, "", f("due"))).toBe(true);
    expect(matchesFilter(reading, "", f("due"))).toBe(false);
    expect(matchesFilter(weak, "", f("weak"))).toBe(true);
    expect(matchesFilter(ok, "", f("weak"))).toBe(false);
    expect(matchesFilter(unread, "", f("weak"))).toBe(false);
    expect(matchesFilter(unread, "", { ...NO_FILTER, topicId: "other" })).toBe(false);
    expect(matchesFilter(unread, "", { ...NO_FILTER, topicId: "t1" })).toBe(true);
  });

  it("round-trips through URL params and ignores unknown values", () => {
    const topics = [{ id: "t1" }, { id: "t2" }];
    const f = { query: "bond", topicId: "t2", status: "due" as const };
    const qs = filterToQuery(f);
    expect(qs).toBe("topic=t2&status=due&q=bond");
    expect(parseFilterParams(Object.fromEntries(new URLSearchParams(qs)), topics)).toEqual(f);
    expect(parseFilterParams({ topic: "nope", status: "weird", q: ["a", "b"] }, topics)).toEqual({ query: "a", topicId: "", status: "all" });
    expect(filterToQuery(NO_FILTER)).toBe("");
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, query: " x " })).toBe(true);
  });

  it("counts chapters and topics", () => {
    const list = [
      chapter({ read: true, practice: true, review: true, accuracy: 90 }),
      chapter({ read: true, accuracy: 40 }, { reviewDue: { kind: "refresh", overdueDays: 0 } }),
      chapter({}, { topicId: "t2" }),
    ];
    expect(chapterCounts(list)).toEqual({ total: 3, read: 2, complete: 1, inProgress: 1, due: 1, weak: 1 });
    expect(topicCounts(list).get("t1")).toEqual({ total: 2, read: 2, complete: 1 });
    expect(topicCounts(list).get("t2")).toEqual({ total: 1, read: 0, complete: 0 });
  });
});

describe("applyChapterPatch (optimistic)", () => {
  const today = "2026-10-06";
  it("stamps dates like the server and recomputes status", () => {
    const a = applyChapterPatch(chapter(), { read: true }, today);
    expect(a.state.read).toBe(true);
    expect(a.state.readOn).toBe(today);
    expect(a.status).toBe("in-progress");
    const b = applyChapterPatch(a, { practice: true, review: true }, today);
    expect(b.status).toBe("complete");
    expect(b.state.reviewedOn).toBe(today);
  });

  it("keeps the original read date when ticking again and clears it on un-read", () => {
    const a = chapter({ read: true, readOn: "2026-09-01" });
    expect(applyChapterPatch(a, { read: true }, today).state.readOn).toBe("2026-09-01");
    const off = applyChapterPatch(a, { read: false }, today);
    expect(off.state.readOn).toBeNull();
  });

  it("clears the due badge when reviewed, and refreshes the review date", () => {
    const due = chapter({ read: true, review: true, reviewedOn: "2026-09-01" }, { reviewDue: { kind: "refresh", overdueDays: 4 } });
    const r = applyChapterPatch(due, { reviewedToday: true }, today);
    expect(r.reviewDue).toBeNull();
    expect(r.state.reviewedOn).toBe(today);
    expect(applyChapterPatch(due, { confidence: 2 }, today).reviewDue).not.toBeNull();
  });

  it("rounds and clears scores, sets confidence", () => {
    expect(applyChapterPatch(chapter(), { accuracy: 71.6 }, today).state.accuracy).toBe(72);
    expect(applyChapterPatch(chapter({ accuracy: 50 }), { accuracy: null }, today).state.accuracy).toBeNull();
    expect(applyChapterPatch(chapter(), { confidence: 3 }, today).state.confidence).toBe(3);
  });
});

describe("validation", () => {
  const today = "2026-10-06";
  it("settings: date window and hours", () => {
    expect(validateSettings({ examDate: "2027-02-18", hours: "10" }, today)).toEqual({});
    expect(validateSettings({ examDate: "2027-01-31", hours: "10" }, today).examDate).toMatch(/February to December 2027/);
    expect(validateSettings({ examDate: "2028-01-01", hours: "10" }, today).examDate).toMatch(/February to December 2027/);
    expect(validateSettings({ examDate: "", hours: "10" }, today).examDate).toMatch(/valid exam date/);
    expect(validateSettings({ examDate: "2027-02-18", hours: "0" }, today).hours).toMatch(/between 1 and 80/);
    expect(validateSettings({ examDate: "2027-02-18", hours: "81" }, today).hours).toBeDefined();
    expect(validateSettings({ examDate: "2027-02-18", hours: "" }, today).hours).toBeDefined();
    expect(validateSettings({ examDate: "2027-02-18", hours: "7.5" }, today)).toEqual({});
    expect(validateSettings({ examDate: "2027-02-18", hours: "10" }, "2027-02-15").examDate).toMatch(/at least a week/);
  });

  it("session: 15 minute minimum, no future, topic from the list", () => {
    const topics = ["Economics", "Mixed review"];
    const ok = { date: today, minutes: 90, topic: "Economics", note: "" };
    expect(validateSession(ok, today, topics)).toEqual({});
    expect(validateSession({ ...ok, minutes: 14 }, today, topics).duration).toMatch(/at least 15/);
    expect(validateSession({ ...ok, minutes: NaN }, today, topics).duration).toBeDefined();
    expect(validateSession({ ...ok, minutes: 24 * 60 + 1 }, today, topics).duration).toBeDefined();
    expect(validateSession({ ...ok, date: "2026-10-07" }, today, topics).date).toMatch(/future/);
    expect(validateSession({ ...ok, topic: "Astrology" }, today, topics).topic).toBeDefined();
    expect(validateSession({ ...ok, note: "x".repeat(301) }, today, topics).note).toBeDefined();
  });

  it("toMinutes combines hours and minutes", () => {
    expect(toMinutes("1", "30")).toBe(90);
    expect(toMinutes("", "45")).toBe(45);
    expect(toMinutes("1.5", "")).toBe(90);
    expect(toMinutes("0", "")).toBe(0);
    expect(toMinutes("-1", "0")).toBeNaN();
    expect(toMinutes("abc", "0")).toBeNaN();
  });

  it("mock: score range and no future date", () => {
    expect(validateMock({ date: today, score: "68.5", note: "" }, today)).toEqual({});
    expect(validateMock({ date: today, score: "101", note: "" }, today).score).toBeDefined();
    expect(validateMock({ date: today, score: "", note: "" }, today).score).toBeDefined();
    expect(validateMock({ date: "2026-12-01", score: "50", note: "" }, today).date).toMatch(/future/);
  });

  it("parseScore accepts blank to clear and rounds to whole percent", () => {
    expect(parseScore("")).toEqual({ ok: true, value: null });
    expect(parseScore(" 72.4 ")).toEqual({ ok: true, value: 72 });
    expect(parseScore("0")).toEqual({ ok: true, value: 0 });
    expect(parseScore("101").ok).toBe(false);
    expect(parseScore("-1").ok).toBe(false);
    expect(parseScore("abc").ok).toBe(false);
  });
});

describe("chart geometry", () => {
  it("niceTicks picks tidy axes from zero", () => {
    expect(niceTicks(12.5)).toEqual({ max: 15, ticks: [0, 5, 10, 15] });
    expect(niceTicks(100).max).toBe(100);
    expect(niceTicks(7).max).toBeGreaterThanOrEqual(7);
    expect(niceTicks(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(NaN).max).toBe(1);
    const t = niceTicks(37);
    expect(t.ticks[0]).toBe(0);
    expect(t.ticks[t.ticks.length - 1]).toBe(t.max);
  });

  it("layoutBars grows bars from the baseline and clamps", () => {
    const bars = layoutBars([0, 5, 10, 20], 10, { x: 10, y: 5, width: 80, height: 100 }, 0.5);
    expect(bars).toHaveLength(4);
    expect(bars[0].height).toBe(0);
    expect(bars[0].y).toBe(105);
    expect(bars[1].height).toBe(50);
    expect(bars[1].y).toBe(55);
    expect(bars[2].height).toBe(100);
    expect(bars[3].height).toBe(100); // clamped to the axis maximum
    expect(bars[0].width).toBe(10);
    expect(bars[0].x).toBe(10 + 5);
    expect(bars[1].x - bars[0].x).toBe(20);
    expect(layoutBars([], 10, { x: 0, y: 0, width: 1, height: 1 })).toEqual([]);
    expect(layoutBars([1], 0, { x: 0, y: 0, width: 1, height: 1 })).toEqual([]);
  });

  it("labelStep thins labels", () => {
    expect(labelStep(10, 12)).toBe(1);
    expect(labelStep(24, 12)).toBe(2);
    expect(labelStep(25, 12)).toBe(3);
    expect(labelStep(0, 12)).toBe(1);
  });

  it("fmtHours trims", () => {
    expect(fmtHours(10)).toBe("10");
    expect(fmtHours(1.25)).toBe("1.3");
    expect(fmtHours(0.04)).toBe("0");
  });
});

describe("wording", () => {
  it("headline follows pace and phase", () => {
    const base = { daysLeft: 100, examDate: "2027-02-18", phase: "first-pass" as const };
    expect(overviewHeadline({ ...base, pace: { status: "on-pace" } })).toBe("Stay on course for February.");
    expect(overviewHeadline({ ...base, pace: { status: "ahead" } })).toBe("You're ahead for February.");
    expect(overviewHeadline({ ...base, pace: { status: "behind" } })).toBe("Let's get you back on pace.");
    expect(overviewHeadline({ ...base, pace: { status: "none" } })).toBe("Let's log your first session.");
    expect(overviewHeadline({ ...base, phase: "before", pace: { status: "none" } })).toBe("Get ready to start for February.");
    expect(overviewHeadline({ ...base, daysLeft: 0, pace: { status: "on-pace" } })).toMatch(/Exam day/);
  });

  it("mock deadlines: recorded, due soon, overdue", () => {
    const d = ["2027-01-24", "2027-02-07"];
    expect(mockDeadlineStates(d, 0, "2027-01-20")).toEqual([
      { label: "Due in 4 days", tone: "neutral", done: false },
      { label: "Due in 18 days", tone: "neutral", done: false },
    ]);
    expect(mockDeadlineStates(d, 1, "2027-01-24")[0]).toEqual({ label: "Recorded", tone: "good", done: true });
    expect(mockDeadlineStates(d, 1, "2027-01-24")[1].label).toBe("Due in 14 days");
    expect(mockDeadlineStates(d, 0, "2027-01-24")[0].label).toBe("Due today");
    expect(mockDeadlineStates(d, 0, "2027-01-25")[0]).toEqual({ label: "1 day overdue", tone: "warn", done: false });
    expect(mockDeadlineStates(d, 0, "2027-01-26")[0].label).toBe("2 days overdue");
  });

  it("mock trend reads direction and a flat band", () => {
    expect(mockTrend(null).dir).toBe("none");
    expect(mockTrend(0.4).dir).toBe("flat");
    expect(mockTrend(4.5)).toEqual({ dir: "up", label: "Up 4.5 points on the previous mock" });
    expect(mockTrend(-1)).toEqual({ dir: "down", label: "Down 1 point on the previous mock" });
  });

  const roadmap = { firstPassEnd: "2026-12-27", lastStudyDay: "2027-02-17" };
  type Pace = TrackerSnapshot["chapterPace"];
  const pace = (forecast: Pace["forecast"], weeklyRate: number | null): Pace => ({ expectedRead: 20, actualRead: 10, behindBy: 10, weeklyRate, forecast });

  it("forecast summary covers each verdict", () => {
    const today = "2026-10-06"; // 12 weeks to the end of the first pass
    const ok = forecastSummary(pace({ finish: "2026-12-01", verdict: "on-schedule" }, 4), roadmap, 60, today, "2027-02-18");
    expect(ok.tone).toBe("good");
    expect(ok.headline).toBe("Finish by 1 Dec");
    expect(ok.neededPerWeek).toBe(5.1);
    const late = forecastSummary(pace({ finish: "2027-01-24", verdict: "late" }, 3), roadmap, 60, today, "2027-02-18");
    expect(late.tone).toBe("warn");
    expect(late.detail).toMatch(/5.1 chapters a week would close the gap/);
    const after = forecastSummary(pace({ finish: "2027-05-02", verdict: "after-exam" }, 1.3), roadmap, 98, today, "2027-02-18");
    expect(after.headline).toMatch(/after the exam/);
    expect(after.detail).toMatch(/Only 1.3 chapters a week lately/);
    expect(forecastSummary(pace({ verdict: "done" }, 5), roadmap, 0, today, "2027-02-18").tone).toBe("good");
    const unknown = forecastSummary(pace({ verdict: "unknown" }, null), roadmap, 98, today, "2027-02-18");
    expect(unknown.tone).toBe("neutral");
    expect(unknown.detail).toMatch(/8.4 chapters a week/);
  });

  it("forecast after the first pass spreads the remainder over the weeks to the exam", () => {
    const r = forecastSummary(pace({ finish: "2027-02-10", verdict: "late" }, 2), roadmap, 14, "2027-01-20", "2027-02-18");
    expect(r.neededPerWeek).toBeGreaterThan(0);
    expect(r.neededPerWeek).toBeLessThanOrEqual(14);
  });
});

describe("study insights", () => {
  const today = "2026-10-06";
  it("lists reviews coming due in the next week, not the ones already due", () => {
    const list = [
      chapter({ read: true, readOn: "2026-10-04" }, { id: "a", title: "A" }), // first review due 10-07
      chapter({ read: true, readOn: "2026-10-01" }, { id: "b", title: "B", reviewDue: { kind: "first-review", overdueDays: 2 } }), // already due
      chapter({ read: true, review: true, readOn: "2026-09-01", reviewedOn: "2026-09-25" }, { id: "c", title: "C" }), // refresh due 10-16
      chapter({ read: true, review: true, readOn: "2026-09-20", reviewedOn: "2026-09-24" }, { id: "d", title: "D" }), // refresh 10-15
      chapter({ read: true }, { id: "e", title: "E" }), // unknown read date
      chapter({}, { id: "f", title: "F" }), // not read
      chapter({ read: true, readOn: "2026-10-06" }, { id: "g", title: "G" }), // due 10-09
    ];
    const up = upcomingReviews(list, today, 7);
    expect(up.map((u) => u.moduleId)).toEqual(["a", "g"]);
    expect(up[0]).toMatchObject({ kind: "first-review", due: "2026-10-07", inDays: 1 });
    expect(upcomingReviews(list, today, 9).map((u) => u.moduleId)).toEqual(["a", "g", "d"]);
    expect(upcomingReviews(list, today, 10).map((u) => u.moduleId)).toEqual(["a", "g", "d", "c"]);
  });

  it("finds the heaviest unread topic", () => {
    const topics = [
      { id: "t1", name: "Light", weightMin: 6, weightMax: 9, weightLabel: "6–9%" },
      { id: "t2", name: "Heavy", weightMin: 11, weightMax: 14, weightLabel: "11–14%" },
      { id: "t3", name: "Done", weightMin: 10, weightMax: 15, weightLabel: "10–15%" },
    ];
    const counts = new Map([
      ["t1", { total: 8, read: 0, complete: 0 }],
      ["t2", { total: 12, read: 6, complete: 0 }],
      ["t3", { total: 6, read: 6, complete: 6 }],
    ]);
    const gap = biggestWeightGap(topics, counts);
    expect(gap?.topic.id).toBe("t1"); // 7.5 unread weight beats 6.25
    counts.set("t1", { total: 8, read: 6, complete: 0 });
    expect(biggestWeightGap(topics, counts)?.topic.id).toBe("t2");
    expect(biggestWeightGap(topics, new Map())).toBeNull();
  });

  it("weakChapters sorts lowest score first and ignores unscored", () => {
    const list = [chapter({ accuracy: 65 }, { title: "B" }), chapter({ accuracy: 40 }, { title: "A" }), chapter({}, { title: "C" }), chapter({ accuracy: 90 }, { title: "D" })];
    expect(weakChapters(list).map((c) => c.title)).toEqual(["A", "B"]);
    expect(weakChapters(list, 1)).toHaveLength(1);
  });
});
