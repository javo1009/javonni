import { describe, expect, it } from "vitest";
import { addDays, diffDays, weekdayIndex } from "../dates";
import { generatePlan, type PlanInput } from "../plan";
import { makeCurriculum } from "./fixtures";

const { topics, modules } = makeCurriculum();

// 90 min Mon–Fri, 240 min Sat, 240 min Sun
const WEEK = [90, 90, 90, 90, 90, 240, 240];

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    startDate: "2026-11-02", // Monday
    examDate: "2027-02-20", // ~16 weeks
    weeklyMinutes: WEEK,
    topics,
    modules,
    ...over,
  };
}

function perDay(items: { date: string; minutes: number }[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.date, (m.get(i.date) ?? 0) + i.minutes);
  return m;
}

describe("generatePlan", () => {
  const plan = generatePlan(input());

  it("is deterministic", () => {
    expect(generatePlan(input())).toEqual(plan);
  });

  it("never emits a fragment shorter than 20 minutes", () => {
    for (const it of plan.items) expect(it.minutes).toBeGreaterThanOrEqual(20);
  });

  it("keeps every item between start and the day before the exam", () => {
    for (const it of plan.items) {
      expect(it.date >= "2026-11-02").toBe(true);
      expect(it.date < "2027-02-20").toBe(true);
    }
  });

  it("never exceeds the day's usable capacity (availability minus buffer)", () => {
    for (const [date, minutes] of perDay(plan.items)) {
      const raw = WEEK[weekdayIndex(date)];
      expect(minutes).toBeLessThanOrEqual(Math.floor((raw * 0.9) / 5) * 5);
    }
  });

  it("schedules a read task covering every learning module and every LOS", () => {
    const read = plan.items.filter((i) => i.type === "read");
    const covered = new Set(read.map((i) => i.moduleId));
    for (const m of modules) expect(covered.has(m.id)).toBe(true);
    const los = new Set(plan.items.flatMap((i) => i.losIds));
    for (const m of modules) for (const id of m.losIds) expect(los.has(id)).toBe(true);
  });

  it("reads each module's chunks in full (split parts add up)", () => {
    for (const m of modules) {
      const reads = plan.items.filter((i) => i.type === "read" && i.moduleId === m.id);
      expect(reads.length).toBeGreaterThan(0);
      const parts = reads[0].parts ?? 1;
      expect(reads.length).toBe(parts);
    }
  });

  it("orders phases learn -> practice -> mock", () => {
    expect(plan.phases.map((p) => p.phase)).toEqual(["learn", "practice", "mock"]);
    for (let i = 1; i < plan.phases.length; i++) {
      expect(plan.phases[i].startDate > plan.phases[i - 1].endDate).toBe(true);
    }
  });

  it("uses most of the budget", () => {
    expect(plan.summary.plannedMinutes / plan.summary.budgetMinutes).toBeGreaterThan(0.85);
    expect(plan.summary.plannedMinutes).toBeLessThanOrEqual(plan.summary.budgetMinutes);
  });

  it("places 3 mocks as paired sessions, the last at least 5 days before the exam", () => {
    const sessions = plan.items.filter((i) => i.type === "mock");
    expect(sessions).toHaveLength(6);
    const last = sessions[sessions.length - 1];
    expect(diffDays(last.date, "2027-02-20")).toBeGreaterThanOrEqual(5);
    for (const s of sessions) expect(s.minutes).toBe(135);
    expect(plan.items.filter((i) => i.type === "mock_review").length).toBeGreaterThanOrEqual(2);
  });

  it("tapers the final two days to light review", () => {
    const d1 = addDays("2027-02-20", -1);
    const d2 = addDays("2027-02-20", -2);
    for (const d of [d1, d2]) {
      const day = plan.items.filter((i) => i.date === d);
      expect(day.every((i) => i.type === "final_review")).toBe(true);
      expect(day.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(60);
    }
  });

  it("spreads Ethics modules across the learn phase instead of front-loading them", () => {
    const eth = plan.items.filter((i) => i.type === "read" && i.topicId === "t-ETH");
    const firstDay = eth[0].date;
    const lastDay = eth[eth.length - 1].date;
    const learn = plan.phases[0];
    const span = diffDays(learn.startDate, learn.endDate);
    expect(diffDays(firstDay, lastDay)).toBeGreaterThan(span * 0.5);
  });

  it("gives heavier, harder topics more learn time than light ones", () => {
    const mins = (id: string) =>
      plan.items.filter((i) => i.phase === "learn" && i.topicId === id).reduce((s, i) => s + i.minutes, 0);
    expect(mins("t-FI")).toBeGreaterThan(mins("t-ALT"));
  });

  it("shifts time away from topics with high prior mastery", () => {
    const base = generatePlan(input());
    const strong = generatePlan(input({ priorMastery: { "t-FI": 0.95 } }));
    const mins = (p: typeof base) =>
      p.items.filter((i) => i.phase === "learn" && i.topicId === "t-FI").reduce((s, i) => s + i.minutes, 0);
    expect(mins(strong)).toBeLessThan(mins(base));
  });

  it("skips blackout dates", () => {
    const p = generatePlan(input({ blackoutDates: ["2026-11-07", "2026-11-08", "2026-12-24", "2026-12-25"] }));
    const days = new Set(p.items.map((i) => i.date));
    for (const d of ["2026-11-07", "2026-11-08", "2026-12-24", "2026-12-25"]) expect(days.has(d)).toBe(false);
  });

  it("omits completed modules' reading when re-planning", () => {
    const done = modules.slice(0, 6).map((m) => m.id);
    const p = generatePlan(input({ completedModuleIds: done }));
    const read = new Set(p.items.filter((i) => i.type === "read").map((i) => i.moduleId));
    for (const id of done) expect(read.has(id)).toBe(false);
    expect(read.size).toBe(modules.length - 6);
  });

  it("warns and degrades gracefully on a short runway", () => {
    const p = generatePlan(input({ startDate: "2027-02-01", examDate: "2027-02-20" }));
    expect(p.warnings.some((w) => w.code === "SHORT_RUNWAY")).toBe(true);
    expect(p.items.length).toBeGreaterThan(0);
    for (const [date, minutes] of perDay(p.items)) {
      expect(minutes).toBeLessThanOrEqual(Math.floor((WEEK[weekdayIndex(date)] * 0.9) / 5) * 5);
    }
  });

  it("warns when the budget is below the study-hours benchmark", () => {
    const p = generatePlan(input({ weeklyMinutes: [30, 30, 30, 30, 30, 60, 60] }));
    expect(p.warnings.some((w) => w.code === "BUDGET_LOW")).toBe(true);
  });

  it("reduces mocks with a warning when no long study days exist", () => {
    const p = generatePlan(input({ weeklyMinutes: [90, 90, 90, 90, 90, 120, 120] }));
    expect(p.items.filter((i) => i.type === "mock")).toHaveLength(0);
    expect(p.warnings.some((w) => w.code === "MOCKS_REDUCED")).toBe(true);
  });

  it("returns an empty plan with a warning if the exam is not in the future", () => {
    const p = generatePlan(input({ examDate: "2026-11-02" }));
    expect(p.items).toEqual([]);
    expect(p.warnings[0].code).toBe("EXAM_TOO_SOON");
  });

  it("returns an empty plan if there is no availability", () => {
    const p = generatePlan(input({ weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] }));
    expect(p.items).toEqual([]);
    expect(p.warnings[0].code).toBe("NO_CAPACITY");
  });

  it("rejects a malformed availability grid", () => {
    expect(() => generatePlan(input({ weeklyMinutes: [60, 60] }))).toThrow();
  });
});
