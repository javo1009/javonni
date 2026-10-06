import { describe, expect, it } from "vitest";
import { SAMPLE_TOPICS, type SampleQuestion } from "../sample-data";

const all = SAMPLE_TOPICS.flatMap((t) => t.modules.flatMap((m) => m.los.map((l) => ({ topic: t, module: m, los: l }))));

const fmt = (n: number, dp = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function q(code: string, i = 0): SampleQuestion {
  const l = all.find((x) => x.los.code === code);
  if (!l) throw new Error(`no LOS ${code}`);
  return l.los.questions[i];
}

describe("sample curriculum integrity", () => {
  it("has unique LOS codes in the topic.module.letter form", () => {
    const codes = all.map((x) => x.los.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]+\.\d+\.[a-z]$/);
  });

  it("has sane topic weights that can cover 100%", () => {
    for (const t of SAMPLE_TOPICS) expect(t.weightMin).toBeLessThanOrEqual(t.weightMax);
    const lo = SAMPLE_TOPICS.reduce((s, t) => s + t.weightMin, 0);
    const hi = SAMPLE_TOPICS.reduce((s, t) => s + t.weightMax, 0);
    expect(lo).toBeLessThanOrEqual(100);
    expect(hi).toBeGreaterThanOrEqual(100);
  });

  it("gives every question three distinct options and an explanation", () => {
    for (const { los } of all) {
      for (const qu of los.questions) {
        const opts = [qu.correct, ...qu.wrong];
        expect(new Set(opts).size, `${los.code}: duplicate options`).toBe(3);
        expect(qu.explanation.trim().length, `${los.code}: missing explanation`).toBeGreaterThanOrEqual(10);
        expect([1, 2, 3]).toContain(qu.difficulty);
      }
    }
  });

  it("leaves only the intentional coverage gaps", () => {
    const gaps = all.filter((x) => x.los.questions.length === 0).map((x) => x.los.code);
    expect(gaps.sort()).toEqual(["DER.1.c", "EQ.1.c", "FI.2.c"]);
  });
});

describe("sample question numerics are right", () => {
  it("time value of money", () => {
    expect(q("QM.1.a", 0).correct).toBe(fmt(1000 * 1.05 ** 3));
    expect(q("QM.1.a", 1).correct).toBe(fmt(10000 / 1.08 ** 4));
    expect(q("QM.1.b", 0).correct).toBe(fmt(50 / 0.06));
    const annuity = (1000 * (1 - 1.1 ** -5)) / 0.1;
    expect(q("QM.1.b", 1).correct).toBe(fmt(annuity));
    expect(q("QM.1.b", 1).wrong).toContain(fmt(annuity * 1.1)); // annuity-due distractor
    expect(q("QM.1.c").correct).toBe(`${fmt((1 + 0.12 / 12) ** 12 * 100 - 100)}%`);
  });

  it("statistics", () => {
    expect(q("QM.2.a").correct).toBe(`${fmt((Math.sqrt(1.2 * 0.9) - 1) * 100)}%`);
    expect(q("QM.2.a").wrong).toContain("5.00%"); // arithmetic mean distractor
    expect(q("QM.2.c").correct).toBe(`${fmt(0.3 * 12 + 0.5 * 8 + 0.2 * -4)}%`);
    expect(q("QM.2.c").wrong).toContain(`${fmt((12 + 8 - 4) / 3)}%`);
  });

  it("financial statements", () => {
    expect(q("FSA.1.a").correct).toBe(`${500 - 320}.`);
    expect(q("FSA.1.c").correct).toBe(`${200 + 800 - 150}.`);
    expect(q("FSA.2.a").correct).toBe(`${((600 - 200) / 400).toFixed(1)}.`);
    expect(q("FSA.2.b").correct).toBe(`${Math.round(0.08 * 1.5 * 2 * 100)}%.`);
  });

  it("corporate finance", () => {
    const npv = 600 / 1.1 + 600 / 1.1 ** 2 - 1000;
    expect(q("CF.1.a").correct).toBe(`${fmt(npv)}.`);
    expect(q("CF.1.a").wrong).toContain(`−${fmt(npv)}.`);
    expect(q("CF.2.a").correct).toBe(`${fmt(0.4 * 4 + 0.6 * 10)}%.`);
    expect(q("CF.2.b").correct).toBe(`${(6 * (1 - 0.25)).toFixed(1)}%.`);
  });

  it("equities", () => {
    expect(q("EQ.1.b").correct).toBe(`${((0.2 * 10000) / 5000) * 100}%.`);
    expect(q("EQ.2.a").correct).toBe(`${fmt(2 / (0.09 - 0.04))}.`);
    expect(q("EQ.2.a").wrong).toContain(`${fmt(2 / 0.09)}.`);
    expect(q("EQ.2.b").correct).toBe(`${(60 / 4).toFixed(1)}.`);
  });

  it("fixed income", () => {
    const price = 50 / 1.06 + 50 / 1.06 ** 2 + 1050 / 1.06 ** 3;
    expect(q("FI.1.a").correct).toBe(`${fmt(price)}.`);
    expect(price).toBeLessThan(1000); // coupon below yield -> discount
    expect(q("FI.2.a").correct).toBe(`−${(7 * 0.5).toFixed(1)}%.`);
  });

  it("derivatives and alternatives", () => {
    expect(q("DER.1.b").correct).toBe(`${fmt(100 * 1.05)}.`);
    expect(q("DER.1.b").wrong).toContain(`${fmt(100 / 1.05)}.`);
    expect(q("DER.2.a").correct).toBe(`${58 - 50 - 3}.`);
    const mgmt = 0.02 * 100;
    const perf = 0.2 * (10 - mgmt);
    expect(q("ALT.1.b").correct).toBe(`${(10 - mgmt - perf).toFixed(1)} million.`);
    expect(q("ALT.2.a").correct).toBe(`${fmt(600000 / 0.08, 0)}.`);
  });

  it("portfolio management", () => {
    expect(q("PM.1.a").correct).toBe(`${(0.6 * 10 + 0.4 * 6).toFixed(1)}%.`);
    expect(q("PM.1.c").correct).toBe(`${((9 - 3) / 12).toFixed(2)}.`);
    expect(q("PM.2.a").correct).toBe(`${(3 + 1.2 * 5).toFixed(1)}%.`);
  });
});
