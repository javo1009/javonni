import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  formatClock,
  optionForKey,
  remainingMs,
  summarize,
  tallyText,
  type QuestionOutcome,
} from "../logic";

describe("formatClock / remainingMs / elapsedMs", () => {
  it("formats m:ss and rounds partial seconds up", () => {
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });
  it("computes time left and never goes negative", () => {
    expect(remainingMs(1000, 11_000, 30_000)).toBe(20_000);
    expect(remainingMs(1000, 99_000, 30_000)).toBe(0);
    expect(remainingMs(0, 0)).toBe(90_000);
  });
  it("clamps elapsed time for the server", () => {
    expect(elapsedMs(1000, 3500)).toBe(2500);
    expect(elapsedMs(5000, 1000)).toBe(0);
    expect(elapsedMs(0, 10_000_000)).toBe(3_600_000);
  });
});

describe("optionForKey", () => {
  const keys = ["A", "B", "C"];
  it("maps digits by position and letters by key", () => {
    expect(optionForKey("1", keys)).toBe("A");
    expect(optionForKey("3", keys)).toBe("C");
    expect(optionForKey("b", keys)).toBe("B");
    expect(optionForKey("C", keys)).toBe("C");
  });
  it("ignores everything else", () => {
    expect(optionForKey("4", keys)).toBeNull();
    expect(optionForKey("d", keys)).toBeNull();
    expect(optionForKey("Enter", keys)).toBeNull();
    expect(optionForKey("a", keys, { ctrl: true })).toBeNull();
    expect(optionForKey("a", keys, { meta: true })).toBeNull();
  });
});

const o = (
  moduleId: string,
  result: QuestionOutcome["result"],
  i = 0,
): QuestionOutcome => ({
  questionId: `${moduleId}-${i}`,
  moduleId,
  moduleTitle: `Module ${moduleId}`,
  result,
});

describe("summarize", () => {
  it("counts results, per-chapter scores and finds the weakest chapter", () => {
    const s = summarize([
      o("a", "correct", 1),
      o("a", "correct", 2),
      o("b", "wrong", 1),
      o("b", "correct", 2),
      o("c", "skipped"),
      o("d", "wrong", 1),
    ]);
    expect(s).toMatchObject({
      total: 6,
      answered: 5,
      correct: 3,
      wrong: 2,
      skipped: 1,
      pct: 60,
    });
    expect(s.byModule.map((m) => [m.moduleId, m.pct])).toEqual([
      ["d", 0],
      ["b", 50],
      ["a", 100],
    ]);
    expect(s.weakest?.moduleId).toBe("d");
  });
  it("has no weakest chapter when everything is right or nothing was answered", () => {
    expect(
      summarize([o("a", "correct"), o("b", "correct", 1)]).weakest,
    ).toBeNull();
    const none = summarize([o("a", "skipped")]);
    expect(none.pct).toBeNull();
    expect(none.weakest).toBeNull();
    expect(summarize([]).total).toBe(0);
  });
  it("breaks ties by number of wrong answers", () => {
    const s = summarize([
      o("a", "wrong", 1),
      o("a", "correct", 2),
      o("b", "wrong", 1),
      o("b", "wrong", 2),
      o("b", "correct", 3),
      o("b", "correct", 4),
    ]);
    // both 50%, b has more wrong answers
    expect(s.weakest?.moduleId).toBe("b");
  });
});

describe("tallyText", () => {
  it("describes a running tally", () => {
    expect(tallyText({ attempts: 12, correct: 9 })).toBe(
      "9 of 12 correct (75%)",
    );
    expect(tallyText({ attempts: 0, correct: 0 })).toBeNull();
    expect(tallyText(null)).toBeNull();
  });
});
