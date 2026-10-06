import { describe, expect, it } from "vitest";
import { describeDue, summarizeItems } from "../due";
import { computeMissing } from "../missing";

const now = new Date("2026-10-06T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const H = 3_600_000;
const D = 24 * H;

describe("describeDue", () => {
  it("describes future deadlines", () => {
    expect(describeDue(at(2 * D + 3 * H), now)).toEqual({
      overdue: false,
      label: "due in 2 days",
    });
    expect(describeDue(at(D), now).label).toBe("due in 1 day");
    expect(describeDue(at(5 * H), now).label).toBe("due in 5 hours");
    expect(describeDue(at(20 * 60_000), now).label).toBe("due in 20 minutes");
    expect(describeDue(at(10_000), now).label).toBe("due now");
  });
  it("describes overdue work", () => {
    expect(describeDue(at(-D - H), now)).toEqual({
      overdue: true,
      label: "overdue by 1 day",
    });
    expect(describeDue(at(-3 * H), now).label).toBe("overdue by 3 hours");
    expect(describeDue(at(-5_000), now).label).toBe(
      "overdue by less than a minute",
    );
  });
});

describe("summarizeItems", () => {
  it("counts by kind with plurals", () => {
    expect(summarizeItems(["file", ...Array(8).fill("mcq")])).toBe(
      "1 file upload · 8 questions",
    );
    expect(summarizeItems(["file", "file", "mcq", "text", "text"])).toBe(
      "2 file uploads · 1 question · 2 written answers",
    );
    expect(summarizeItems([])).toBe("No items");
  });
});

describe("computeMissing", () => {
  const items = [
    { id: "f", kind: "file" as const },
    { id: "q1", kind: "mcq" as const },
    { id: "q2", kind: "mcq" as const },
    { id: "t", kind: "text" as const },
  ];
  it("blocks on a file item without uploads and warns about unanswered questions", () => {
    const m = computeMissing(items, { q1: { chosenKey: "A" } }, {});
    expect(m.ready).toBe(false);
    expect(m.blocking).toEqual(["Upload your work"]);
    expect(m.warnings).toEqual(["2 questions unanswered"]);
    expect(m.unanswered).toBe(2);
  });
  it("is ready once files are in, even with unanswered questions", () => {
    const m = computeMissing(
      items,
      {
        q1: { chosenKey: "A" },
        q2: { chosenKey: "B" },
        t: { textAnswer: "   " },
      },
      { f: 1 },
    );
    expect(m.ready).toBe(true);
    expect(m.blocking).toEqual([]);
    expect(m.warnings).toEqual(["1 question unanswered"]);
  });
  it("is clean when everything is done", () => {
    const m = computeMissing(
      items,
      {
        q1: { chosenKey: "A" },
        q2: { chosenKey: "B" },
        t: { textAnswer: "hi" },
      },
      { f: 2 },
    );
    expect(m).toMatchObject({
      ready: true,
      blocking: [],
      warnings: [],
      unanswered: 0,
    });
  });
  it("counts several empty file items", () => {
    const m = computeMissing(
      [
        { id: "a", kind: "file" },
        { id: "b", kind: "file" },
      ],
      {},
      { a: 1 },
    );
    expect(m.blocking).toEqual(["Upload your work (1 of 2 still empty)"]);
  });
});
