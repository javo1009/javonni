import { describe, expect, it } from "vitest";
import { assessProgress, formatMinutes, type AssessItem } from "../assessment";

const item = (date: string, minutes: number, status: AssessItem["status"], type = "read"): AssessItem => ({ date, minutes, status, type });
const base = { today: "2026-12-01", examDate: "2027-02-20" };

describe("assessProgress", () => {
  it("is on track when done matches due", () => {
    const a = assessProgress({ ...base, items: [item("2026-11-30", 60, "done"), item("2026-12-01", 60, "done"), item("2026-12-02", 60, "todo")] });
    expect(a.state).toBe("on_track");
    expect(a.deltaMinutes).toBe(0);
    expect(a.options).toEqual([]);
  });

  it("is ahead when more is done than due (including future work done early)", () => {
    const a = assessProgress({ ...base, items: [item("2026-12-01", 60, "done"), item("2026-12-05", 90, "done")] });
    expect(a.state).toBe("ahead");
    expect(a.deltaMinutes).toBe(90);
  });

  it("is behind with recovery options when moderately short", () => {
    const items = [
      item("2026-11-28", 120, "todo"),
      item("2026-11-29", 120, "done"),
      item("2026-12-01", 60, "todo"),
      item("2026-12-04", 60, "todo", "review"),
      ...Array.from({ length: 40 }, (_, i) => item(`2026-12-${String(2 + (i % 20)).padStart(2, "0")}`, 60, "todo")),
    ];
    const a = assessProgress({ ...base, items });
    expect(a.deltaMinutes).toBe(-180);
    expect(a.state).toBe("behind");
    const add = a.options.find((o) => o.kind === "add_time");
    expect(add).toBeTruthy();
    expect(add && add.kind === "add_time" && add.extraMinutesPerWeek % 15).toBe(0);
  });

  it("flags at_risk when far behind and suggests reviewing the exam date", () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`2026-11-${String(10 + i).padStart(2, "0")}`, 60, "todo"));
    const a = assessProgress({ ...base, items });
    expect(a.state).toBe("at_risk");
    expect(a.options.some((o) => o.kind === "review_exam_date")).toBe(true);
  });

  it("treats skipped tasks as not done", () => {
    const a = assessProgress({ ...base, items: [item("2026-11-30", 120, "skipped"), item("2026-12-01", 30, "done")] });
    expect(a.deltaMinutes).toBe(-120);
  });

  it("omits add_time when there is no runway left", () => {
    const a = assessProgress({
      today: "2027-02-15",
      examDate: "2027-02-20",
      items: [item("2027-02-14", 300, "todo"), item("2027-02-16", 60, "todo")],
    });
    expect(a.options.some((o) => o.kind === "add_time")).toBe(false);
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
  });
});
