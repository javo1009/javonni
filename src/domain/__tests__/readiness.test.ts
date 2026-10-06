import { describe, expect, it } from "vitest";
import { applyAttempt, newMasteryState, type MasteryState } from "../mastery";
import { computeReadiness } from "../readiness";
import { makeCurriculum } from "./fixtures";

const { topics, modules, los } = makeCurriculum();
const T0 = Date.UTC(2026, 10, 2);
const DAY = 86_400_000;

function practise(losIds: string[], correct: boolean, n: number): Map<string, MasteryState> {
  const m = new Map<string, MasteryState>();
  for (const id of losIds) {
    let s = newMasteryState();
    for (let i = 0; i < n; i++) s = applyAttempt(s, { correct, difficulty: 2, context: "practice", at: T0 + (i % 3) * DAY + i * 1000 });
    m.set(id, s);
  }
  return m;
}

describe("readiness", () => {
  it("is insufficient with no attempts", () => {
    const r = computeReadiness(topics, modules, los, new Map(), T0);
    expect(r.mid).toBe(0);
    expect(r.insufficient).toBe(true);
    expect(r.evidenceLabel).toBe("low");
  });

  it("rises as coverage and accuracy rise, and stays conservative for unseen LOS", () => {
    const some = computeReadiness(topics, modules, los, practise(los.slice(0, 30).map((l) => l.id), true, 8), T0 + 3 * DAY);
    const all = computeReadiness(topics, modules, los, practise(los.map((l) => l.id), true, 8), T0 + 3 * DAY);
    expect(some.mid).toBeGreaterThan(0);
    expect(all.mid).toBeGreaterThan(some.mid);
    expect(all.mid).toBeLessThanOrEqual(100);
  });

  it("returns an ordered range around the midpoint", () => {
    const r = computeReadiness(topics, modules, los, practise(los.map((l) => l.id), true, 3), T0 + DAY);
    expect(r.low).toBeLessThanOrEqual(r.mid);
    expect(r.high).toBeGreaterThanOrEqual(r.mid);
    expect(r.high - r.low).toBeGreaterThan(0);
  });

  it("narrows the range as evidence accumulates", () => {
    const few = computeReadiness(topics, modules, los, practise(los.map((l) => l.id), true, 2), T0 + DAY);
    const many = computeReadiness(topics, modules, los, practise(los.map((l) => l.id), true, 20), T0 + DAY);
    expect(many.high - many.low).toBeLessThan(few.high - few.low);
    expect(many.evidenceLabel === "high" || many.evidenceLabel === "moderate").toBe(true);
  });

  it("flags a topic below the mastery floor even when overall readiness is high", () => {
    const ids = los.map((l) => l.id);
    const weakTopicLos = los.filter((l) => l.id.startsWith("l-DER")).map((l) => l.id);
    const strong = practise(ids.filter((i) => !weakTopicLos.includes(i)), true, 10);
    const weak = practise(weakTopicLos, false, 6);
    const r = computeReadiness(topics, modules, los, new Map([...strong, ...weak]), T0 + DAY);
    const der = r.topics.find((t) => t.topicId === "t-DER")!;
    expect(der.belowFloor).toBe(true);
    expect(r.mid).toBeGreaterThan(60);
  });
});
