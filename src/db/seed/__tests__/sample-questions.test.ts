import { describe, expect, it } from "vitest";
import official from "../official-2027.json";
import { SAMPLE_QUESTIONS, type SampleQuestion } from "../sample-questions";

const slugs = new Set(official.topics.flatMap((t) => t.modules.map((m) => m.slug)));
const fmt = (n: number, dp = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** The question in a module whose stem contains `fragment`. */
function q(module: string, fragment: string): SampleQuestion {
  const found = SAMPLE_QUESTIONS.find((x) => x.module === module && x.stem.includes(fragment));
  if (!found) throw new Error(`no question in ${module} containing "${fragment}"`);
  return found;
}

describe("sample question integrity", () => {
  it("maps every question to a real official module", () => {
    for (const x of SAMPLE_QUESTIONS) expect(slugs.has(x.module), x.module).toBe(true);
  });
  it("gives each question three distinct options, an explanation and a valid difficulty", () => {
    for (const x of SAMPLE_QUESTIONS) {
      expect(new Set([x.correct, ...x.wrong]).size, x.stem).toBe(3);
      expect(x.explanation.trim().length).toBeGreaterThanOrEqual(10);
      expect([1, 2, 3]).toContain(x.difficulty);
    }
    expect(new Set(SAMPLE_QUESTIONS.map((x) => x.stem)).size).toBe(SAMPLE_QUESTIONS.length);
  });
});

describe("sample question numerics are right", () => {
  it("time value of money and returns", () => {
    expect(q("quantitative-methods-04", "future value of 1,000").correct).toBe(fmt(1000 * 1.05 ** 3));
    expect(q("quantitative-methods-04", "present value of 10,000").correct).toBe(fmt(10000 / 1.08 ** 4));
    expect(q("quantitative-methods-04", "perpetuity pays 50").correct).toBe(fmt(50 / 0.06));
    const annuity = (1000 * (1 - 1.1 ** -5)) / 0.1;
    expect(q("quantitative-methods-04", "ordinary annuity pays 1,000").correct).toBe(fmt(annuity));
    expect(q("quantitative-methods-04", "ordinary annuity pays 1,000").wrong).toContain(fmt(annuity * 1.1)); // annuity due distractor
    expect(q("quantitative-methods-04", "12% compounded monthly").correct).toBe(`${fmt((1 + 0.12 / 12) ** 12 * 100 - 100)}%`);
    expect(q("quantitative-methods-02", "geometric mean").correct).toBe(`${fmt((Math.sqrt(1.2 * 0.9) - 1) * 100)}%`);
    expect(q("quantitative-methods-05", "Scenario returns").correct).toBe(`${fmt(0.3 * 12 + 0.5 * 8 + 0.2 * -4)}%`);
  });

  it("statements, corporate finance and equities", () => {
    expect(q("financial-statement-analysis-03", "total assets of 500").correct).toBe(`${500 - 320}.`);
    expect(q("financial-statement-analysis-06", "Beginning inventory is 200").correct).toBe(`${200 + 800 - 150}.`);
    expect(q("financial-statement-analysis-11", "quick ratio").correct).toBe(`${((600 - 200) / 400).toFixed(1)}.`);
    expect(q("financial-statement-analysis-11", "net profit margin").correct).toBe(`${Math.round(0.08 * 1.5 * 2 * 100)}%.`);
    const npv = 600 / 1.1 + 600 / 1.1 ** 2 - 1000;
    expect(q("corporate-finance-05", "costs 1,000 today").correct).toBe(`${fmt(npv)}.`);
    expect(q("corporate-finance-06", "40% with debt").correct).toBe(`${fmt(0.4 * 4 + 0.6 * 10)}%.`);
    expect(q("corporate-finance-06", "pre-tax cost of debt").correct).toBe(`${(6 * (1 - 0.25)).toFixed(1)}%.`);
    expect(q("equities-03", "buys 10,000 of stock").correct).toBe(`${((0.2 * 10000) / 5000) * 100}%.`);
    expect(q("equities-06", "Next year's dividend is 2.00").correct).toBe(`${fmt(2 / (0.09 - 0.04))}.`);
    expect(q("equities-07", "price-to-earnings").correct).toBe(`${(60 / 4).toFixed(1)}.`);
    expect(q("equities-12", "CAPM required return").correct).toBe(`${(3 + 1.2 * 5).toFixed(1)}%.`);
  });

  it("fixed income, derivatives, alternatives and portfolios", () => {
    const price = 50 / 1.06 + 50 / 1.06 ** 2 + 1050 / 1.06 ** 3;
    expect(q("fixed-income-06", "3-year annual-pay bond").correct).toBe(`${fmt(price)}.`);
    expect(q("fixed-income-11", "modified duration of 7").correct).toBe(`−${(7 * 0.5).toFixed(1)}%.`);
    expect(q("derivatives-and-risk-management-04", "1-year forward price").correct).toBe(`${fmt(100 * 1.05)}.`);
    expect(q("derivatives-and-risk-management-02", "buys a call option").correct).toBe(`${58 - 50 - 3}.`);
    const perf = 0.2 * (10 - 2);
    expect(q("alternative-investments-02", "20% performance fee").correct).toBe(`${(10 - 2 - perf).toFixed(1)} million.`);
    expect(q("alternative-investments-04", "net operating income").correct).toBe(`${fmt(600000 / 0.08, 0)}.`);
    expect(q("portfolio-construction-01", "60% in an asset").correct).toBe(`${(0.6 * 10 + 0.4 * 6).toFixed(1)}%.`);
    expect(q("portfolio-construction-02", "Sharpe ratio").correct).toBe(`${((9 - 3) / 12).toFixed(2)}.`);
  });
});
