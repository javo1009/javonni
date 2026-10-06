import { describe, expect, it } from "vitest";
import { formatDay, formatDayLong, formatShortDate } from "../tracker-dates";

describe("tracker dates", () => {
  it("formats the same way everywhere", () => {
    expect(formatShortDate("2026-10-06")).toBe("6 Oct");
    expect(formatDay("2026-10-06")).toBe("Tue 6 Oct");
    expect(formatDayLong("2027-02-18")).toBe("Thursday 18 February");
    expect(formatDay("2026-10-05")).toBe("Mon 5 Oct");
    expect(formatShortDate("2027-01-01")).toBe("1 Jan");
  });
});
