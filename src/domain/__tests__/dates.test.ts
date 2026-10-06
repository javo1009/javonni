import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDay, isValidDate, startOfWeek, weekdayIndex } from "../dates";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });
  it("diffs days independent of DST", () => {
    expect(diffDays("2027-03-01", "2027-04-01")).toBe(31);
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
  });
  it("numbers weekdays Monday=0", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0); // Monday
    expect(weekdayIndex("2026-10-11")).toBe(6); // Sunday
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
  });
  it("lists inclusive ranges and validates", () => {
    expect(eachDay("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
  });
});
