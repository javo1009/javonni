import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import {
  EMPTY_CHAPTER,
  TRACKER,
  activeTopicWindow,
  allocate,
  buildRoadmap,
  calibration,
  chapterStatus,
  computeChapterPace,
  computeConsistency,
  computePace,
  expectedChaptersRead,
  focusModel,
  hoursInRange,
  mockDeadlines,
  mockStats,
  nextActions,
  paceMessage,
  phaseOf,
  reviewQueue,
  topicProgress,
  totals,
  weekBounds,
  weightLabel,
} from "../tracker";
import { modules, readFirst, state, statesOf, topicOrder, topics } from "./tracker-fixtures";

const PLAN_START = "2026-10-06";
const EXAM = "2027-02-18";

describe("curriculum data", () => {
  it("has the 102 official modules across 10 topics, 14 first-pass weeks", () => {
    expect(modules).toHaveLength(102);
    expect(topics).toHaveLength(10);
    expect(topics.reduce((s, t) => s + t.studyWeeks, 0)).toBe(14);
    expect(topics.map((t) => weightLabel(t))).toEqual(["11–14%", "11–14%", "6–9%", "6–9%", "11–14%", "11–14%", "6–9%", "6–9%", "8–12%", "10–15%"]);
  });
});

describe("allocate", () => {
  it("sums to the total and respects the minimum", () => {
    for (const total of [10, 14, 20, 31, 5]) {
      const a = allocate(total, [2, 2, 1, 1, 2, 2, 1, 1, 1, 1], 1);
      expect(a.reduce((x, y) => x + y, 0)).toBe(Math.max(total, 10));
      expect(Math.min(...a)).toBeGreaterThanOrEqual(1);
    }
  });
  it("is proportional when it divides evenly", () => {
    expect(allocate(14, [2, 2, 1, 1, 2, 2, 1, 1, 1, 1], 1)).toEqual([2, 2, 1, 1, 2, 2, 1, 1, 1, 1]);
    expect(allocate(28, [2, 2, 1, 1, 2, 2, 1, 1, 1, 1], 1)).toEqual([4, 4, 2, 2, 4, 4, 2, 2, 2, 2]);
  });
});

describe("roadmap", () => {
  const r = buildRoadmap({ planStart: PLAN_START, examDate: EXAM, topics });

  it("reproduces the sample dashboard's schedule exactly", () => {
    const expected: [string, string, string][] = [
      ["QM", "2026-10-05", "2026-10-18"],
      ["FSA", "2026-10-19", "2026-11-01"],
      ["ECO", "2026-11-02", "2026-11-08"],
      ["CF", "2026-11-09", "2026-11-15"],
      ["EQ", "2026-11-16", "2026-11-29"],
      ["FI", "2026-11-30", "2026-12-13"],
      ["DER", "2026-12-14", "2026-12-20"],
      ["ALT", "2026-12-21", "2026-12-27"],
      ["PC", "2026-12-28", "2027-01-03"],
      ["ETH", "2027-01-04", "2027-01-10"],
    ];
    expect(r.topics.map((w) => [w.topicId, w.start, w.end])).toEqual(expected);
    expect(r.firstPassEnd).toBe("2027-01-10");
    expect(r.reviewStart).toBe("2027-01-11");
    expect(r.lastStudyDay).toBe("2027-02-17");
    expect(r.tight).toBe(false);
  });

  it("is contiguous and ends before the exam for any runway", () => {
    for (const exam of ["2027-02-18", "2027-05-19", "2027-08-18", "2027-11-17", "2027-01-20", "2026-12-15", "2026-11-20"]) {
      const road = buildRoadmap({ planStart: "2026-10-06", examDate: exam, topics });
      expect(road.topics).toHaveLength(10);
      road.topics.forEach((w, i) => {
        expect(w.end >= w.start, `${exam} ${w.topicId}`).toBe(true);
        expect(w.end < exam).toBe(true);
        if (i > 0 && road.topics[i - 1].end < road.lastStudyDay) expect(w.start).toBe(addDays(road.topics[i - 1].end, 1));
      });
      expect(road.lastStudyDay).toBe(addDays(exam, -1));
    }
  });

  it("gives each topic whole weeks on a normal runway and scales with it", () => {
    const long = buildRoadmap({ planStart: "2026-10-06", examDate: "2027-08-18", topics });
    expect(long.weeks).toBeGreaterThan(r.weeks);
    const days = long.topics.map((w) => (new Date(w.end).getTime() - new Date(w.start).getTime()) / 86_400_000 + 1);
    for (const d of days) expect(d % 7).toBe(0);
    expect(days.reduce((a, b) => a + b, 0) / 7 / long.weeks).toBeGreaterThan(0.65);
  });

  it("falls back to day-sized topics when there are fewer weeks than topics", () => {
    const tight = buildRoadmap({ planStart: "2026-12-14", examDate: "2027-02-18", topics });
    expect(tight.tight).toBe(true);
    expect(tight.topics.every((w) => w.end >= w.start)).toBe(true);
    expect(tight.firstPassEnd <= tight.lastStudyDay).toBe(true);
  });

  it("finds the active topic and phase", () => {
    expect(activeTopicWindow(r, "2026-10-12")?.topicId).toBe("QM");
    expect(activeTopicWindow(r, "2026-11-30")?.topicId).toBe("FI");
    expect(activeTopicWindow(r, "2027-01-20")).toBeNull();
    expect(phaseOf(r, "2026-10-01")).toBe("before");
    expect(phaseOf(r, "2026-10-12")).toBe("first-pass");
    expect(phaseOf(r, "2027-01-20")).toBe("review");
    expect(phaseOf(r, "2027-02-18")).toBe("after");
  });
});

describe("pace", () => {
  const minutes = (hours: number) => new Map([["2026-10-20", hours * 60]]);
  const pace = (hours: number, today = "2026-11-03") =>
    computePace({ planStart: PLAN_START, examDate: EXAM, today, weeklyTargetHours: 10, minutesByDate: minutes(hours) });

  it("matches the sample's expected hours and capacity", () => {
    const p = pace(0);
    expect(p.expectedHours).toBeCloseTo(40, 5); // 28 days = 4 weeks × 10 h
    expect(p.capacityHours).toBeCloseTo((135 / 7) * 10, 5);
    expect(p.status).toBe("none");
  });

  it("reports ahead, on pace and behind with the sample's messages", () => {
    expect(pace(45)).toMatchObject({ status: "ahead", message: "5 hours ahead of your planned pace. Keep working through the current topic." });
    expect(pace(39).status).toBe("on-pace");
    expect(pace(38).status).toBe("on-pace"); // exactly 2 h behind is still on pace
    expect(pace(30)).toMatchObject({ status: "behind", message: "10 hours behind planned pace. Add a catch-up session or adjust the weekly target." });
  });

  it("ignores sessions outside the plan window and clamps fractions", () => {
    const p = computePace({
      planStart: PLAN_START,
      examDate: EXAM,
      today: "2026-11-03",
      weeklyTargetHours: 10,
      minutesByDate: new Map([["2026-09-01", 600], ["2026-10-20", 60], ["2027-03-01", 600]]),
    });
    expect(p.totalHours).toBe(1);
    expect(p.loggedFraction).toBeGreaterThan(0);
    const before = computePace({ planStart: PLAN_START, examDate: EXAM, today: "2026-09-01", weeklyTargetHours: 10, minutesByDate: new Map() });
    expect(before.expectedHours).toBe(0);
    expect(paceMessage("none", 0)).toMatch(/first session/);
  });

  it("sums hours by range and finds the Monday-based week", () => {
    const m = new Map([["2026-11-02", 90], ["2026-11-08", 30], ["2026-11-09", 60]]);
    expect(hoursInRange(m, "2026-11-02", "2026-11-08")).toBe(2);
    expect(weekBounds("2026-11-05")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(weekBounds("2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});

describe("progress", () => {
  it("derives chapter status", () => {
    expect(chapterStatus(EMPTY_CHAPTER)).toBe("not-started");
    expect(chapterStatus(state({ read: true }))).toBe("in-progress");
    expect(chapterStatus(state({ practice: true }))).toBe("in-progress");
    expect(chapterStatus(state({ read: true, practice: true, review: true }))).toBe("complete");
  });

  it("summarises topics: reads, completions, practice averages and weak chapters", () => {
    const states = statesOf({
      "quantitative-methods-01": { read: true, practice: true, review: true, accuracy: 80 },
      "quantitative-methods-02": { read: true, accuracy: 60 },
      "quantitative-methods-03": { accuracy: 50 },
    });
    const p = topicProgress(topics, modules, states).get("QM")!;
    expect(p).toMatchObject({ total: 11, read: 2, complete: 1, scored: 3, weak: 2, avgAccuracy: 63 });
    expect(topicProgress(topics, modules, states).get("ECO")).toMatchObject({ total: 8, read: 0, avgAccuracy: null });
  });

  it("weights coverage by exam weight, so heavy topics count more", () => {
    const heavy = totals(topics, topicProgress(topics, modules, readFirst("FI", 19)));
    const light = totals(topics, topicProgress(topics, modules, readFirst("ALT", 7)));
    expect(heavy.read).toBe(19);
    expect(light.read).toBe(7);
    expect(heavy.weightedReadPct).toBeGreaterThan(light.weightedReadPct);
    expect(totals(topics, topicProgress(topics, modules, new Map()))).toMatchObject({ total: 102, read: 0, readPct: 0, weightedReadPct: 0 });
  });
});

describe("chapter pace and forecast", () => {
  const road = buildRoadmap({ planStart: PLAN_START, examDate: EXAM, topics });
  const prog = (states: Parameters<typeof topicProgress>[2]) => topicProgress(topics, modules, states);

  it("expects finished topics in full and the active topic pro rata", () => {
    const none = prog(new Map());
    expect(expectedChaptersRead(road, none, "2026-10-04")).toBe(0);
    expect(expectedChaptersRead(road, none, "2026-10-18")).toBe(11); // QM complete
    expect(expectedChaptersRead(road, none, "2026-11-01")).toBe(23); // + FSA
    expect(expectedChaptersRead(road, none, "2027-01-30")).toBe(102);
    const mid = expectedChaptersRead(road, none, "2026-10-11"); // 7 of 14 days into QM
    expect(mid).toBe(5);
  });

  it("reports how far behind or ahead of the roadmap", () => {
    const states = new Map([...readFirst("QM", 8, "2026-10-14")]);
    const p = computeChapterPace({ roadmap: road, progress: prog(states), states, today: "2026-10-18" });
    expect(p).toMatchObject({ expectedRead: 11, actualRead: 8, behindBy: 3 });
  });

  it("forecasts the finish from the last three weeks' reading", () => {
    // 6 chapters in 3 weeks = 2/week; 96 remaining = 48 weeks -> far past the exam.
    const states = new Map([...readFirst("QM", 6, "2026-10-12")]);
    const p = computeChapterPace({ roadmap: road, progress: prog(states), states, today: "2026-10-18" });
    expect(p.weeklyRate).toBe(2);
    expect(p.forecast).toMatchObject({ verdict: "after-exam" });
  });

  it("calls a fast reader on schedule, a slower one late, and handles unknowns and done", () => {
    const fast = new Map<string, ReturnType<typeof state>>();
    for (const m of modules.slice(0, 60)) fast.set(m.id, state({ read: true, readOn: "2026-12-10" }));
    const f = computeChapterPace({ roadmap: road, progress: prog(fast), states: fast, today: "2026-12-12" });
    expect(f.forecast).toMatchObject({ verdict: "on-schedule" }); // 60 in 3 weeks = 20/week -> done within ~2 weeks

    // 60 chapters read in the last three weeks = 20/week; 42 left is ~2 weeks, but it's already 5 Jan: past the first pass (10 Jan) -> late.
    const late = new Map<string, ReturnType<typeof state>>();
    for (const m of modules.slice(0, 60)) late.set(m.id, state({ read: true, readOn: "2026-12-28" }));
    const l = computeChapterPace({ roadmap: road, progress: prog(late), states: late, today: "2027-01-05" });
    expect(l.forecast).toMatchObject({ verdict: "late", finish: "2027-01-20" });

    const unknownDates = new Map([...readFirst("QM", 5, null)]);
    expect(computeChapterPace({ roadmap: road, progress: prog(unknownDates), states: unknownDates, today: "2026-10-18" }).forecast).toEqual({ verdict: "unknown" });

    const all = new Map(modules.map((m) => [m.id, state({ read: true })]));
    expect(computeChapterPace({ roadmap: road, progress: prog(all), states: all, today: "2026-10-18" }).forecast).toEqual({ verdict: "done" });
  });
});

describe("spaced review queue", () => {
  const today = "2026-11-10";
  const ids = ["quantitative-methods-01", "quantitative-methods-02", "quantitative-methods-03", "quantitative-methods-04", "economics-01"];
  const q = (entries: Record<string, Partial<ReturnType<typeof state>>>) => reviewQueue(modules, statesOf(entries), today, topicOrder);

  it("queues a first review three days after reading", () => {
    expect(q({ [ids[0]]: { read: true, readOn: "2026-11-08" } })).toEqual([]);
    const due = q({ [ids[0]]: { read: true, readOn: "2026-11-07" } });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ moduleId: ids[0], kind: "first-review", overdueDays: 0 });
  });

  it("refreshes reviewed chapters after 21 days", () => {
    expect(q({ [ids[0]]: { read: true, review: true, reviewedOn: "2026-10-25" } })).toEqual([]);
    expect(q({ [ids[0]]: { read: true, review: true, reviewedOn: "2026-10-20" } })[0]).toMatchObject({ kind: "refresh", overdueDays: 0 });
  });

  it("skips chapters whose dates are unknown (e.g. restored from a backup) and unread ones", () => {
    expect(q({ [ids[0]]: { read: true } })).toEqual([]);
    expect(q({ [ids[0]]: { practice: true } })).toEqual([]);
    expect(q({ [ids[0]]: { read: true, review: true } })).toEqual([]);
  });

  it("orders first reviews before refreshes, then most overdue first", () => {
    const out = q({
      [ids[0]]: { read: true, review: true, reviewedOn: "2026-10-01" },
      [ids[1]]: { read: true, readOn: "2026-11-01" },
      [ids[2]]: { read: true, readOn: "2026-10-20" },
      [ids[4]]: { read: true, readOn: "2026-10-20" },
    });
    expect(out.map((i) => i.moduleId)).toEqual([ids[2], ids[4], ids[1], ids[0]]);
  });
});

describe("consistency", () => {
  const today = "2026-11-12"; // Thursday
  const mins = (...days: [string, number][]) => new Map(days);

  it("counts the current streak, allowing today to be empty", () => {
    const m = mins(["2026-11-12", 60], ["2026-11-11", 30], ["2026-11-10", 45], ["2026-11-08", 60]);
    expect(computeConsistency(m, today, 10).currentStreak).toBe(3);
    const noToday = mins(["2026-11-11", 30], ["2026-11-10", 45]);
    expect(computeConsistency(noToday, today, 10).currentStreak).toBe(2);
    const stale = mins(["2026-11-09", 30]);
    expect(computeConsistency(stale, today, 10).currentStreak).toBe(0);
  });

  it("finds the longest streak and active days in the last 28", () => {
    const days: [string, number][] = [];
    for (let i = 0; i < 5; i++) days.push([addDays("2026-10-01", i), 30]);
    for (let i = 0; i < 3; i++) days.push([addDays("2026-11-10", i), 30]);
    days.push(["2026-08-01", 30]);
    const c = computeConsistency(mins(...days), today, 10);
    expect(c.longestStreak).toBe(5);
    expect(c.activeDays28).toBe(3 + 0); // only Nov 10-12 fall in Oct 16–Nov 12
  });

  it("lays out 12 Monday-first weeks with intensity levels and future days flagged", () => {
    const c = computeConsistency(mins(["2026-11-12", 200], ["2026-11-11", 10], ["2026-11-10", 100]), today, 7);
    expect(c.weeks).toHaveLength(TRACKER.streakWindowWeeks);
    for (const w of c.weeks) expect(w).toHaveLength(7);
    const last = c.weeks[c.weeks.length - 1];
    expect(last[0].date).toBe("2026-11-09"); // Monday
    expect(last.find((d) => d.date === "2026-11-12")?.level).toBe(4); // 200 min vs 60 min/day target
    expect(last.find((d) => d.date === "2026-11-11")?.level).toBe(1);
    expect(last.find((d) => d.date === "2026-11-10")?.level).toBe(3);
    expect(last.find((d) => d.date === "2026-11-13")?.future).toBe(true);
  });
});

describe("calibration", () => {
  it("flags confidence that doesn't match scores", () => {
    const states = statesOf({
      "quantitative-methods-01": { confidence: 3, accuracy: 55 },
      "quantitative-methods-02": { confidence: 3, accuracy: 85 },
      "quantitative-methods-03": { confidence: 1, accuracy: 90 },
      "quantitative-methods-04": { confidence: 2 },
      "quantitative-methods-05": { accuracy: 40 },
    });
    const c = calibration(modules, states);
    expect(c.rated).toBe(4);
    expect(c.overconfident.map((x) => x.moduleId)).toEqual(["quantitative-methods-01"]);
    expect(c.underconfident.map((x) => x.moduleId)).toEqual(["quantitative-methods-03"]);
  });
});

describe("mocks", () => {
  it("summarises results", () => {
    expect(mockStats([])).toEqual({ count: 0, best: null, latest: null, average: null, change: null });
    const s = mockStats([{ date: "2027-02-01", score: 66 }, { date: "2027-01-24", score: 61.5 }, { date: "2027-02-08", score: 71 }]);
    expect(s).toMatchObject({ count: 3, best: 71, latest: 71, change: 5, average: 66.2 });
  });
  it("puts the first and second mock 25 and 11 days before the exam (24 Jan and 7 Feb for 18 Feb)", () => {
    expect(mockDeadlines("2027-02-18")).toEqual(["2027-01-24", "2027-02-07"]);
  });
});

describe("focus and next actions", () => {
  const road = buildRoadmap({ planStart: PLAN_START, examDate: EXAM, topics });
  const fmt = (d: string) => d;

  it("focuses on the active topic with its chapters", () => {
    const f = focusModel({ roadmap: road, modules, states: readFirst("FI", 3), today: "2026-12-01" });
    expect(f).toMatchObject({ kind: "topic", topicId: "FI", read: 3, total: 19, start: "2026-11-30", end: "2026-12-13" });
    expect(f.kind === "topic" && f.chapterIds).toHaveLength(19);
  });

  it("switches to review with the weakest chapters after the first pass, and to upcoming before it", () => {
    const states = statesOf({ "quantitative-methods-01": { accuracy: 50 }, "economics-01": { accuracy: 90 } });
    expect(focusModel({ roadmap: road, modules, states, today: "2027-01-20" })).toMatchObject({ kind: "review", weakIds: ["quantitative-methods-01"], total: 102 });
    expect(focusModel({ roadmap: road, modules, states, today: "2026-10-01" }).kind).toBe("upcoming");
  });

  const base = {
    roadmap: road,
    topics,
    modules,
    today: "2026-10-12",
    examDate: EXAM,
    mockCount: 0,
    weekHours: 3,
    weeklyTargetHours: 10,
    review: [],
    formatDate: fmt,
  };

  it("suggests the next unread chapter first, then mocks and remaining hours", () => {
    const a = nextActions({ ...base, states: readFirst("QM", 2) });
    expect(a[0]).toMatchObject({ title: "Read the next chapter", detail: "Benchmarking Returns" });
    expect(a.map((x) => x.title)).toContain("Keep mocks on the calendar");
    expect(a.find((x) => x.title === "Finish this week's hours")?.detail).toBe("7 hours remain against your target.");
  });

  it("adds due reviews and weak chapters, capped at four", () => {
    const states = statesOf({ "quantitative-methods-01": { read: true, readOn: "2026-10-01", accuracy: 45 } });
    const review = reviewQueue(modules, states, "2026-10-12", topicOrder);
    const a = nextActions({ ...base, states, review });
    expect(a).toHaveLength(4);
    expect(a[1].title).toBe("Review 1 chapter due");
    expect(a.some((x) => x.title === "Rework a weak area" && x.detail.includes("45%"))).toBe(true);
  });

  it("falls back to practice when the topic is fully read, and to weakest-chapter review outside the first pass", () => {
    const all = readFirst("QM", 11);
    expect(nextActions({ ...base, states: all })[0].title).toBe("Practice this topic");
    expect(nextActions({ ...base, states: new Map(), today: "2027-01-20" })[0].title).toBe("Review your weakest chapter");
  });

  it("stops suggesting mocks once two are done or the exam has passed", () => {
    expect(nextActions({ ...base, states: new Map(), mockCount: 2 }).map((a) => a.title)).not.toContain("Keep mocks on the calendar");
    expect(nextActions({ ...base, states: new Map(), today: "2027-02-19" }).map((a) => a.title)).not.toContain("Keep mocks on the calendar");
  });
});
