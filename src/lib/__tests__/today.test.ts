import { describe, expect, it } from "vitest";
import { isValidTimezone, todayIn } from "../today";

describe("todayIn", () => {
  const instant = new Date("2026-12-31T22:30:00Z");
  it("uses the user's calendar date, not the server's", () => {
    expect(todayIn("UTC", instant)).toBe("2026-12-31");
    expect(todayIn("Asia/Tashkent", instant)).toBe("2027-01-01"); // UTC+5
    expect(todayIn("America/New_York", instant)).toBe("2026-12-31");
  });
  it("falls back to UTC for an invalid zone", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(todayIn("Mars/Olympus", instant)).toBe("2026-12-31");
  });
});
