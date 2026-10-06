import { describe, expect, it } from "vitest";
import { evaluateAlerts, groupAlerts, type StudentSnapshot } from "../alerts";

const base: StudentSnapshot = {
  studentId: "s1",
  name: "Sam",
  today: "2026-11-20",
  joinedOn: "2026-10-05",
  lastActiveDate: "2026-11-19",
  planStart: "2026-10-05",
  weeklyTargetMinutes: 600,
  minutes14d: 1100,
  chaptersRead: 20,
  chaptersExpected: 22,
  missedHomework: 0,
  mockScores: [55, 60],
  scoredChapters: 6,
  avgAccuracy: 72,
};
const kinds = (s: StudentSnapshot) => evaluateAlerts(s).map((a) => a.kind);

describe("alert rules", () => {
  it("raises nothing for a student who is on track", () => {
    expect(kinds(base)).toEqual([]);
  });

  it("flags inactivity from 5 days, escalating at 10", () => {
    expect(kinds({ ...base, lastActiveDate: "2026-11-15" })).toContain("inactive");
    expect(kinds({ ...base, lastActiveDate: "2026-11-16" })).not.toContain("inactive");
    const a = evaluateAlerts({ ...base, lastActiveDate: "2026-11-05" }).find((x) => x.kind === "inactive")!;
    expect(a.severity).toBe("high");
    expect(a.evidence).toBe("No activity for 15 days.");
  });

  it("flags no activity at all only after a grace period for new students", () => {
    expect(kinds({ ...base, lastActiveDate: null, joinedOn: "2026-11-19" })).not.toContain("inactive");
    expect(kinds({ ...base, lastActiveDate: null, joinedOn: "2026-11-10" })).toContain("inactive");
  });

  it("flags too few hours against the weekly target, scaled to time on the plan", () => {
    const a = evaluateAlerts({ ...base, minutes14d: 300 }).find((x) => x.kind === "behind_hours")!;
    expect(a.evidence).toBe("Logged 5 h of 20 h planned in the last 14 days.");
    expect(kinds({ ...base, minutes14d: 600 })).not.toContain("behind_hours"); // exactly half is acceptable
    // joined 5 days ago: only 5 days of plan to measure against
    const fresh = { ...base, joinedOn: "2026-11-16", planStart: "2026-10-05", minutes14d: 20 };
    expect(evaluateAlerts(fresh).find((x) => x.kind === "behind_hours")?.evidence).toMatch(/of 7\.1 h planned in the last 5 days/);
    expect(kinds({ ...fresh, joinedOn: "2026-11-19", minutes14d: 0 })).not.toContain("behind_hours"); // too early to judge
  });

  it("flags falling behind the roadmap with the counts as evidence", () => {
    expect(kinds({ ...base, chaptersRead: 19 })).toContain("behind_roadmap");
    expect(kinds({ ...base, chaptersRead: 20 })).not.toContain("behind_roadmap");
    const a = evaluateAlerts({ ...base, chaptersRead: 12 }).find((x) => x.kind === "behind_roadmap")!;
    expect(a.severity).toBe("high");
    expect(a.evidence).toBe("12 chapters read; the roadmap expects 22 by now (10 behind).");
  });

  it("gives new students a week before flagging them against a roadmap that started earlier", () => {
    const newcomer = { ...base, chaptersRead: 0, chaptersExpected: 30, joinedOn: "2026-11-16", lastActiveDate: "2026-11-19" };
    expect(kinds(newcomer)).not.toContain("behind_roadmap");
    expect(kinds({ ...newcomer, joinedOn: "2026-11-12" })).toContain("behind_roadmap");
  });

  it("flags missed homework, mock drops and low practice scores", () => {
    expect(kinds({ ...base, missedHomework: 2 })).toContain("missed_homework");
    expect(kinds({ ...base, missedHomework: 1 })).not.toContain("missed_homework");
    expect(kinds({ ...base, mockScores: [64, 57] })).toContain("mock_drop");
    expect(kinds({ ...base, mockScores: [64, 60] })).not.toContain("mock_drop");
    expect(kinds({ ...base, avgAccuracy: 55 })).toContain("low_scores");
    expect(kinds({ ...base, avgAccuracy: 55, scoredChapters: 2 })).not.toContain("low_scores");
    expect(kinds({ ...base, avgAccuracy: null, scoredChapters: 0 })).not.toContain("low_scores");
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
