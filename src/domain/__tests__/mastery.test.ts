import { describe, expect, it } from "vitest";
import {
  applyAttempt,
  attemptWeight,
  evidenceOf,
  masteryOf,
  newMasteryState,
  type AttemptInput,
  type MasteryState,
} from "../mastery";
import { coverageStats, deriveLosStatus } from "../status";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);

const attempt = (over: Partial<AttemptInput> = {}): AttemptInput => ({
  correct: true,
  difficulty: 2,
  context: "practice",
  at: T0,
  ...over,
});

function run(attempts: AttemptInput[]): MasteryState {
  return attempts.reduce((s, a) => applyAttempt(s, a), newMasteryState());
}

describe("mastery model", () => {
  it("starts at the 0.5 prior with no evidence", () => {
    const s = newMasteryState();
    expect(masteryOf(s, T0)).toBe(0.5);
    expect(evidenceOf(s, T0)).toBe(0);
  });

  it("rises with correct answers and falls with wrong ones", () => {
    const up = run([attempt(), attempt(), attempt()]);
    const down = run([attempt({ correct: false }), attempt({ correct: false }), attempt({ correct: false })]);
    expect(masteryOf(up, T0)).toBeGreaterThan(0.7);
    expect(masteryOf(down, T0)).toBeLessThan(0.3);
  });

  it("weights hard questions and timed contexts more, open-book homework less", () => {
    expect(attemptWeight({ difficulty: 3, context: "practice" })).toBeGreaterThan(
      attemptWeight({ difficulty: 1, context: "practice" }),
    );
    expect(attemptWeight({ difficulty: 2, context: "mock" })).toBeGreaterThan(attemptWeight({ difficulty: 2, context: "practice" }));
    expect(attemptWeight({ difficulty: 2, context: "homework", openBook: true })).toBeLessThan(
      attemptWeight({ difficulty: 2, context: "homework" }),
    );
  });

  it("decays evidence toward the prior with a 21-day half-life", () => {
    const s = run([attempt(), attempt(), attempt(), attempt()]);
    const fresh = evidenceOf(s, T0);
    expect(evidenceOf(s, T0 + 21 * DAY)).toBeCloseTo(fresh / 2, 5);
    expect(masteryOf(s, T0 + 300 * DAY)).toBeCloseTo(0.5, 2);
  });

  it("counts distinct active days", () => {
    const s = run([attempt(), attempt({ at: T0 + 3600_000 }), attempt({ at: T0 + DAY })]);
    expect(s.activeDays).toBe(2);
    expect(s.attempts).toBe(3);
  });
});

describe("LOS status", () => {
  const good = (days: number) =>
    run(
      Array.from({ length: 6 }, (_, i) => attempt({ at: T0 + Math.floor(i / (6 / days)) * DAY + i * 1000 })),
    );

  it("walks not_started -> studied -> practiced -> proficient", () => {
    expect(deriveLosStatus(false, null, T0)).toBe("not_started");
    expect(deriveLosStatus(true, null, T0)).toBe("studied");
    const few = run([attempt(), attempt()]);
    expect(deriveLosStatus(false, few, T0)).toBe("studied");
    const four = run([attempt(), attempt(), attempt(), attempt()]); // one day only
    expect(deriveLosStatus(true, four, T0)).toBe("practiced");
    expect(deriveLosStatus(true, good(2), T0 + 2 * DAY)).toBe("proficient");
  });

  it("requires evidence from at least two distinct days to be proficient", () => {
    expect(deriveLosStatus(true, good(1), T0)).toBe("practiced");
  });

  it("flips a proficient LOS to review_due when it goes stale", () => {
    const s = good(2);
    expect(deriveLosStatus(true, s, T0 + 2 * DAY)).toBe("proficient");
    expect(deriveLosStatus(true, s, T0 + 40 * DAY)).toBe("review_due");
  });

  it("flips to review_due when mastery drops after mistakes", () => {
    let s = good(2);
    for (let i = 0; i < 6; i++) s = applyAttempt(s, attempt({ correct: false, at: T0 + 3 * DAY + i * 1000 }));
    expect(deriveLosStatus(true, s, T0 + 3 * DAY + 10_000)).toBe("review_due");
  });

  it("summarises coverage and proficiency", () => {
    const c = coverageStats(["not_started", "studied", "proficient", "review_due"]);
    expect(c.coveragePct).toBe(0.75);
    expect(c.proficiencyPct).toBe(0.25);
    expect(c.reviewDue).toBe(1);
    expect(coverageStats([]).coveragePct).toBe(0);
  });
});
