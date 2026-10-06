import { describe, expect, it } from "vitest";
import { evaluateAlerts, groupAlerts, type StudentSnapshot } from "../alerts";

const base: StudentSnapshot = {
  studentId: "s1",
  name: "Sam",
  today: "2026-11-20",
  lastActiveDate: "2026-11-19",
  plannedMinutes14d: 600,
  doneMinutes14d: 560,
  readinessWeekly: [30, 36, 41, 47],
  missedHomework: 0,
  mockScores: [55, 60],
};

const kinds = (s: StudentSnapshot) => evaluateAlerts(s).map((a) => a.kind);

describe("alert rules", () => {
  it("raises nothing for a healthy student", () => {
    expect(kinds(base)).toEqual([]);
  });

  it("flags inactivity from 5 days, escalating at 10", () => {
    expect(kinds({ ...base, lastActiveDate: "2026-11-15" })).toContain("inactive");
    expect(kinds({ ...base, lastActiveDate: "2026-11-16" })).not.toContain("inactive");
    const high = evaluateAlerts({ ...base, lastActiveDate: "2026-11-05" }).find((a) => a.kind === "inactive")!;
    expect(high.severity).toBe("high");
    expect(high.evidence).toMatch(/15 days/);
  });

  it("treats a student with no activity at all as inactive", () => {
    expect(kinds({ ...base, lastActiveDate: null })).toContain("inactive");
  });

  it("flags low plan adherence with the hours behind as evidence", () => {
    const a = evaluateAlerts({ ...base, doneMinutes14d: 240 }).find((x) => x.kind === "behind_plan")!;
    expect(a.evidence).toMatch(/40%/);
    expect(a.evidence).toMatch(/6 h behind/);
  });

  it("ignores adherence when almost nothing was planned", () => {
    expect(kinds({ ...base, plannedMinutes14d: 60, doneMinutes14d: 0 })).not.toContain("behind_plan");
  });

  it("flags flat readiness over three weeks", () => {
    expect(kinds({ ...base, readinessWeekly: [44, 44, 45, 44] })).toContain("stagnating");
    expect(kinds({ ...base, readinessWeekly: [44, 44] })).not.toContain("stagnating");
  });

  it("flags two or more missed homeworks and a mock-score drop", () => {
    expect(kinds({ ...base, missedHomework: 2 })).toContain("missed_homework");
    expect(kinds({ ...base, missedHomework: 1 })).not.toContain("missed_homework");
    expect(kinds({ ...base, mockScores: [64, 57] })).toContain("mock_drop");
    expect(kinds({ ...base, mockScores: [64, 60] })).not.toContain("mock_drop");
  });

  it("groups by student, most severe and most numerous first", () => {
    const alerts = [
      ...evaluateAlerts({ ...base, studentId: "a", name: "Ann", missedHomework: 2 }),
      ...evaluateAlerts({ ...base, studentId: "b", name: "Bo", lastActiveDate: "2026-11-01", missedHomework: 3 }),
      ...evaluateAlerts({ ...base, studentId: "c", name: "Cy", lastActiveDate: "2026-11-01" }),
    ];
    const groups = groupAlerts(alerts);
    expect(groups.map((g) => g[0].studentId)).toEqual(["b", "c", "a"]);
    expect(groups[0]).toHaveLength(2);
  });
});
