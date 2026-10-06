// SAMPLE CURRICULUM — written for demonstration only.
//
// * Topic weights are the ranges reported (unverified) for the 2027 Level I exam.
// * Modules and learning objectives below are ORIGINAL, illustrative wording.
//   They are NOT the official CFA Institute learning outcome statements.
// * Questions are original. Each has three options, like the real exam format.
// * A few objectives intentionally have no questions, so the admin coverage
//   report has real gaps to show.
//
// Replace all of this by importing the official outline (Admin > Curriculum).

export type SampleQuestion = {
  stem: string;
  correct: string;
  wrong: [string, string];
  explanation: string;
  difficulty: 1 | 2 | 3;
};

export type SampleLos = {
  code: string;
  commandWord: string;
  text: string;
  importance: 1 | 2 | 3;
  questions: SampleQuestion[];
};

export type SampleModule = { title: string; estMinutes: number; los: SampleLos[] };

export type SampleTopic = {
  code: string;
  name: string;
  weightMin: number;
  weightMax: number;
  difficulty: 1 | 2 | 3;
  spread: boolean;
  modules: SampleModule[];
};

export const SAMPLE_VERSION = {
  name: "Sample curriculum (demo) — replace with the official 2027 outline",
  level: "I",
  year: 2027,
  sourceNote:
    "SAMPLE DATA. Weights are third-party-reported and unverified. Modules and objectives are illustrative, not official learning outcome statements.",
};

export const SAMPLE_TOPICS: SampleTopic[] = [
  {
    code: "ETH",
    name: "Ethical and Professional Standards",
    weightMin: 15,
    weightMax: 20,
    difficulty: 2,
    spread: true,
    modules: [
      {
        title: "Ethics and the investment profession",
        estMinutes: 120,
        los: [
          {
            code: "ETH.1.a",
            commandWord: "explain",
            text: "Explain why ethical conduct and a professional code matter for trust in the investment industry.",
            importance: 2,
            questions: [
              {
                stem: "Which statement best describes why a professional code of conduct matters in investment management?",
                correct: "It supports trust in the profession and helps protect client interests.",
                wrong: ["It guarantees that clients will earn higher returns.", "It removes the need for any regulation."],
                explanation:
                  "Codes of conduct set expected behaviour and so support trust in the profession and protect clients. They do not guarantee returns and they complement, rather than replace, regulation.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "ETH.1.b",
            commandWord: "describe",
            text: "Describe the duties owed to clients, including loyalty, prudence and care.",
            importance: 3,
            questions: [
              {
                stem: "A client's objective is capital preservation. An adviser could earn a higher commission by recommending a volatile product. The adviser's duty of loyalty implies the adviser should:",
                correct: "put the client's interests ahead of the adviser's own compensation and recommend a suitable product.",
                wrong: [
                  "recommend the volatile product, because commissions are a legitimate source of income.",
                  "recommend the volatile product and disclose the commission after the sale.",
                ],
                explanation: "Loyalty means client interests come before the adviser's own. A product unsuitable for the client's objective should not be recommended because it pays more.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
      {
        title: "Standards in practice",
        estMinutes: 150,
        los: [
          {
            code: "ETH.2.a",
            commandWord: "identify",
            text: "Identify conflicts of interest and describe how to disclose and manage them.",
            importance: 3,
            questions: [
              {
                stem: "A portfolio manager personally owns shares of a company and plans to buy the same company for client accounts. The most appropriate action is to:",
                correct: "disclose the conflict and make sure client trades take priority over personal trades.",
                wrong: ["buy for clients first and say nothing, because the personal position is small.", "buy personally first so the client price is not affected."],
                explanation: "Conflicts should be disclosed, and client transactions must have priority over personal ones.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "ETH.2.b",
            commandWord: "explain",
            text: "Explain the treatment of material nonpublic information.",
            importance: 3,
            questions: [
              {
                stem: "An analyst learns from an acquaintance at a company that a takeover bid will be announced tomorrow. The information is not public. The analyst should:",
                correct: "not act on the information and not pass it on.",
                wrong: ["trade for client accounts before the announcement.", "trade only in a personal account, to avoid affecting clients."],
                explanation: "Material nonpublic information must not be traded on or disseminated.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "QM",
    name: "Quantitative Methods",
    weightMin: 6,
    weightMax: 9,
    difficulty: 3,
    spread: false,
    modules: [
      {
        title: "Time value of money",
        estMinutes: 180,
        los: [
          {
            code: "QM.1.a",
            commandWord: "calculate",
            text: "Calculate present and future values of single cash flows.",
            importance: 3,
            questions: [
              {
                stem: "What is the future value of 1,000 invested for 3 years at 5% per year, compounded annually?",
                correct: "1,157.63",
                wrong: ["1,150.00", "1,160.00"],
                explanation: "FV = 1,000 × 1.05³ = 1,157.63. The 1,150 option ignores compounding.",
                difficulty: 1,
              },
              {
                stem: "What is the present value of 10,000 to be received in 4 years, discounted at 8% per year?",
                correct: "7,350.30",
                wrong: ["6,800.00", "7,500.00"],
                explanation: "PV = 10,000 / 1.08⁴ = 7,350.30.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "QM.1.b",
            commandWord: "calculate",
            text: "Calculate the present value of an ordinary annuity and of a perpetuity.",
            importance: 3,
            questions: [
              {
                stem: "A perpetuity pays 50 per year. At a discount rate of 6%, its present value is closest to:",
                correct: "833.33",
                wrong: ["300.00", "3,000.00"],
                explanation: "PV = 50 / 0.06 = 833.33.",
                difficulty: 1,
              },
              {
                stem: "An ordinary annuity pays 1,000 at the end of each year for 5 years. At 10% per year, its present value is closest to:",
                correct: "3,790.79",
                wrong: ["4,169.87", "5,000.00"],
                explanation: "PV = 1,000 × [1 − 1.10⁻⁵] / 0.10 = 3,790.79. The 4,169.87 option is an annuity due.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "QM.1.c",
            commandWord: "calculate",
            text: "Convert a stated annual rate with periodic compounding to an effective annual rate.",
            importance: 2,
            questions: [
              {
                stem: "A stated annual rate of 12% compounded monthly corresponds to an effective annual rate closest to:",
                correct: "12.68%",
                wrong: ["12.00%", "13.20%"],
                explanation: "EAR = (1 + 0.12/12)¹² − 1 = 12.68%.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
      {
        title: "Statistical measures and probability",
        estMinutes: 180,
        los: [
          {
            code: "QM.2.a",
            commandWord: "calculate",
            text: "Calculate arithmetic and geometric mean returns and explain when each applies.",
            importance: 2,
            questions: [
              {
                stem: "An investment returned +20% in year 1 and −10% in year 2. Its geometric mean annual return is closest to:",
                correct: "3.92%",
                wrong: ["5.00%", "4.50%"],
                explanation: "Geometric mean = √(1.20 × 0.90) − 1 = 3.92%. The arithmetic mean (5.00%) overstates compound growth.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "QM.2.b",
            commandWord: "interpret",
            text: "Interpret standard deviation as a measure of dispersion.",
            importance: 2,
            questions: [
              {
                stem: "Portfolios X and Y have the same mean return. X has the larger standard deviation. Which statement is correct?",
                correct: "X's returns are more dispersed around the mean.",
                wrong: ["X has the higher expected return.", "X is necessarily the better portfolio."],
                explanation: "Standard deviation measures dispersion around the mean. It says nothing on its own about expected return or which portfolio is better.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "QM.2.c",
            commandWord: "calculate",
            text: "Calculate an expected value from scenario probabilities.",
            importance: 2,
            questions: [
              {
                stem: "Scenario returns: 12% with probability 0.3, 8% with probability 0.5, and −4% with probability 0.2. The expected return is:",
                correct: "6.80%",
                wrong: ["5.33%", "8.00%"],
                explanation: "E(R) = 0.3 × 12 + 0.5 × 8 + 0.2 × (−4) = 6.80%. The 5.33% option is a simple average.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "ECO",
    name: "Economics",
    weightMin: 6,
    weightMax: 9,
    difficulty: 2,
    spread: false,
    modules: [
      {
        title: "Demand, supply and elasticity",
        estMinutes: 150,
        los: [
          {
            code: "ECO.1.a",
            commandWord: "explain",
            text: "Explain how price elasticity of demand relates to total revenue.",
            importance: 2,
            questions: [
              {
                stem: "Demand for a product is elastic. If the seller raises the price, total revenue will most likely:",
                correct: "fall.",
                wrong: ["rise.", "remain unchanged."],
                explanation: "With elastic demand, the percentage fall in quantity exceeds the percentage rise in price, so revenue falls.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "ECO.1.b",
            commandWord: "describe",
            text: "Describe factors that shift demand and supply curves.",
            importance: 2,
            questions: [
              {
                stem: "The price of a substitute good rises. Demand for the original good will most likely:",
                correct: "increase (shift right).",
                wrong: ["decrease (shift left).", "be unaffected."],
                explanation: "Buyers switch toward the relatively cheaper good, shifting its demand curve to the right.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
      {
        title: "Monetary policy and currencies",
        estMinutes: 180,
        los: [
          {
            code: "ECO.2.a",
            commandWord: "explain",
            text: "Explain how central bank open market operations affect money supply and interest rates.",
            importance: 3,
            questions: [
              {
                stem: "A central bank buys government securities in the open market. The money supply and short-term interest rates will most likely:",
                correct: "increase and fall, respectively.",
                wrong: ["decrease and rise, respectively.", "increase and rise, respectively."],
                explanation: "Purchases inject reserves into the banking system, raising the money supply and pushing short-term rates down.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "ECO.2.b",
            commandWord: "describe",
            text: "Distinguish nominal from real interest rates.",
            importance: 2,
            questions: [
              {
                stem: "The nominal interest rate is 6% and expected inflation is 2%. The approximate real interest rate is:",
                correct: "4%.",
                wrong: ["8%.", "3%."],
                explanation: "Real rate ≈ nominal rate − expected inflation = 4%.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "ECO.2.c",
            commandWord: "explain",
            text: "Explain how currency appreciation affects exports and imports.",
            importance: 2,
            questions: [
              {
                stem: "All else equal, appreciation of a country's currency will most likely make its exports:",
                correct: "more expensive for foreign buyers.",
                wrong: ["cheaper for foreign buyers.", "unaffected in foreign-currency terms."],
                explanation: "A stronger domestic currency raises the foreign-currency price of exports.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "FSA",
    name: "Financial Statement Analysis",
    weightMin: 11,
    weightMax: 14,
    difficulty: 3,
    spread: false,
    modules: [
      {
        title: "Financial statements and inventories",
        estMinutes: 210,
        los: [
          {
            code: "FSA.1.a",
            commandWord: "explain",
            text: "Explain the accounting equation and how transactions affect it.",
            importance: 2,
            questions: [
              {
                stem: "A firm reports total assets of 500 and total liabilities of 320. Its shareholders' equity is:",
                correct: "180.",
                wrong: ["820.", "320."],
                explanation: "Assets = Liabilities + Equity, so Equity = 500 − 320 = 180.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "FSA.1.b",
            commandWord: "compare",
            text: "Compare FIFO and LIFO inventory methods in a period of rising prices.",
            importance: 3,
            questions: [
              {
                stem: "In a period of rising prices with stable inventory quantities, relative to FIFO, LIFO will most likely report:",
                correct: "higher cost of goods sold and lower net income.",
                wrong: ["lower cost of goods sold and higher net income.", "the same cost of goods sold."],
                explanation: "LIFO expenses the most recent (higher) costs first, so COGS is higher and income lower.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FSA.1.c",
            commandWord: "calculate",
            text: "Calculate cost of goods sold from inventory and purchases data.",
            importance: 2,
            questions: [
              {
                stem: "Beginning inventory is 200, purchases are 800, and ending inventory is 150. Cost of goods sold is:",
                correct: "850.",
                wrong: ["750.", "1,150."],
                explanation: "COGS = Beginning inventory + Purchases − Ending inventory = 200 + 800 − 150 = 850.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
      {
        title: "Ratio analysis and depreciation",
        estMinutes: 210,
        los: [
          {
            code: "FSA.2.a",
            commandWord: "calculate",
            text: "Calculate and interpret liquidity ratios.",
            importance: 2,
            questions: [
              {
                stem: "Current assets are 600 (of which inventory is 200) and current liabilities are 400. The quick ratio, defined as (current assets − inventory) / current liabilities, is:",
                correct: "1.0.",
                wrong: ["1.5.", "0.5."],
                explanation: "Quick ratio = (600 − 200) / 400 = 1.0. The current ratio would be 1.5.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FSA.2.b",
            commandWord: "calculate",
            text: "Decompose return on equity using the three-step DuPont framework.",
            importance: 3,
            questions: [
              {
                stem: "A firm has a net profit margin of 8%, asset turnover of 1.5 and an equity multiplier (assets/equity) of 2.0. Its return on equity is:",
                correct: "24%.",
                wrong: ["12%.", "9.5%."],
                explanation: "ROE = margin × turnover × leverage = 0.08 × 1.5 × 2.0 = 24%.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FSA.2.c",
            commandWord: "compare",
            text: "Compare straight-line and accelerated depreciation.",
            importance: 2,
            questions: [
              {
                stem: "Relative to straight-line depreciation, an accelerated method will result in net income in the early years of an asset's life that is:",
                correct: "lower.",
                wrong: ["higher.", "the same."],
                explanation: "Accelerated methods charge more depreciation early, which lowers early-year income.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "CF",
    name: "Corporate Finance",
    weightMin: 6,
    weightMax: 9,
    difficulty: 2,
    spread: false,
    modules: [
      {
        title: "Capital budgeting",
        estMinutes: 180,
        los: [
          {
            code: "CF.1.a",
            commandWord: "calculate",
            text: "Calculate the net present value of a project.",
            importance: 3,
            questions: [
              {
                stem: "A project costs 1,000 today and returns 600 at the end of each of the next 2 years. At a 10% discount rate, the NPV is closest to:",
                correct: "41.32.",
                wrong: ["200.00.", "−41.32."],
                explanation: "NPV = 600/1.10 + 600/1.10² − 1,000 = 545.45 + 495.87 − 1,000 = 41.32.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "CF.1.b",
            commandWord: "explain",
            text: "Explain the IRR decision rule.",
            importance: 2,
            questions: [
              {
                stem: "A project with conventional cash flows has an IRR of 12% and the required rate of return is 10%. The project should be:",
                correct: "accepted, because IRR exceeds the required return.",
                wrong: ["rejected, because IRR exceeds the required return.", "accepted only if its payback period is under one year."],
                explanation: "The IRR rule accepts projects whose IRR exceeds the required rate of return.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
      {
        title: "Cost of capital",
        estMinutes: 180,
        los: [
          {
            code: "CF.2.a",
            commandWord: "calculate",
            text: "Calculate the weighted average cost of capital.",
            importance: 3,
            questions: [
              {
                stem: "A firm is financed 40% with debt (after-tax cost 4%) and 60% with equity (cost 10%). Its WACC is:",
                correct: "7.60%.",
                wrong: ["7.00%.", "14.00%."],
                explanation: "WACC = 0.4 × 4% + 0.6 × 10% = 7.60%.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "CF.2.b",
            commandWord: "calculate",
            text: "Calculate the after-tax cost of debt.",
            importance: 2,
            questions: [
              {
                stem: "A firm's pre-tax cost of debt is 6% and its tax rate is 25%. The after-tax cost of debt is:",
                correct: "4.5%.",
                wrong: ["6.0%.", "1.5%."],
                explanation: "After-tax cost = 6% × (1 − 0.25) = 4.5%.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "EQ",
    name: "Equities",
    weightMin: 11,
    weightMax: 14,
    difficulty: 2,
    spread: false,
    modules: [
      {
        title: "Market organization and trading",
        estMinutes: 150,
        los: [
          {
            code: "EQ.1.a",
            commandWord: "describe",
            text: "Distinguish primary from secondary markets.",
            importance: 1,
            questions: [
              {
                stem: "A company sells new shares to investors for the first time. This takes place in the:",
                correct: "primary market.",
                wrong: ["secondary market.", "derivatives market."],
                explanation: "New securities are issued in the primary market. Later trading among investors is the secondary market.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "EQ.1.b",
            commandWord: "calculate",
            text: "Calculate the return on equity of a leveraged (margin) position.",
            importance: 2,
            questions: [
              {
                stem: "An investor buys 10,000 of stock with 5,000 of their own money and 5,000 borrowed. The stock rises 20%. Ignoring interest and costs, the return on the investor's own equity is:",
                correct: "40%.",
                wrong: ["20%.", "10%."],
                explanation: "Gain = 20% × 10,000 = 2,000 on 5,000 invested = 40%.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "EQ.1.c",
            commandWord: "explain",
            text: "Explain the mechanics and risks of a short sale.",
            importance: 2,
            questions: [],
          },
        ],
      },
      {
        title: "Equity valuation",
        estMinutes: 210,
        los: [
          {
            code: "EQ.2.a",
            commandWord: "calculate",
            text: "Calculate the value of a stock using the constant-growth dividend discount model.",
            importance: 3,
            questions: [
              {
                stem: "Next year's dividend is 2.00, the required return is 9% and dividends grow at 4% forever. The intrinsic value is:",
                correct: "40.00.",
                wrong: ["22.22.", "50.00."],
                explanation: "V = D₁ / (r − g) = 2.00 / (0.09 − 0.04) = 40.00.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "EQ.2.b",
            commandWord: "calculate",
            text: "Calculate and interpret a price-to-earnings multiple.",
            importance: 2,
            questions: [
              {
                stem: "A stock trades at 60 and earnings per share are 4.00. The price-to-earnings ratio is:",
                correct: "15.0.",
                wrong: ["0.067.", "240."],
                explanation: "P/E = 60 / 4 = 15.0.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "EQ.2.c",
            commandWord: "explain",
            text: "Explain the weak form of market efficiency.",
            importance: 2,
            questions: [
              {
                stem: "If markets are weak-form efficient, which approach is least likely to generate consistent excess returns?",
                correct: "Trading on patterns in historical prices.",
                wrong: ["Trading on material nonpublic information.", "Both are equally likely to generate consistent excess returns."],
                explanation: "Weak-form efficiency says past prices are already reflected in current prices, so price-pattern strategies should not beat the market consistently.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "FI",
    name: "Fixed Income",
    weightMin: 11,
    weightMax: 14,
    difficulty: 3,
    spread: false,
    modules: [
      {
        title: "Bond pricing basics",
        estMinutes: 210,
        los: [
          {
            code: "FI.1.a",
            commandWord: "calculate",
            text: "Calculate the price of a fixed-rate bond given its yield.",
            importance: 3,
            questions: [
              {
                stem: "A 3-year annual-pay bond has a 5% coupon and 1,000 face value. If the market yield is 6%, its price is closest to:",
                correct: "973.27.",
                wrong: ["1,000.00.", "1,026.73."],
                explanation: "Price = 50/1.06 + 50/1.06² + 1,050/1.06³ = 973.27. A coupon below the yield means a discount to par.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FI.1.b",
            commandWord: "explain",
            text: "Explain how maturity and coupon affect a bond's price sensitivity to yield changes.",
            importance: 3,
            questions: [
              {
                stem: "All else equal, which bond is most sensitive to a change in yield?",
                correct: "10-year bond with a 6% coupon.",
                wrong: ["2-year bond with a 6% coupon.", "10-year bond with a 9% coupon."],
                explanation: "Longer maturity and lower coupon both increase duration and therefore price sensitivity.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FI.1.c",
            commandWord: "describe",
            text: "Describe when a bond trades at a premium, par or discount.",
            importance: 2,
            questions: [
              {
                stem: "A bond's coupon rate is higher than the market yield for comparable bonds. The bond will most likely trade:",
                correct: "at a premium to par.",
                wrong: ["at a discount to par.", "at par."],
                explanation: "Above-market coupons make the bond more valuable than par.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
      {
        title: "Duration and credit risk",
        estMinutes: 210,
        los: [
          {
            code: "FI.2.a",
            commandWord: "calculate",
            text: "Estimate a bond's percentage price change using modified duration.",
            importance: 3,
            questions: [
              {
                stem: "A bond has a modified duration of 7. If its yield rises by 50 basis points, its price will change by approximately:",
                correct: "−3.5%.",
                wrong: ["+3.5%.", "−0.35%."],
                explanation: "ΔP/P ≈ −ModDur × Δy = −7 × 0.005 = −3.5%.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "FI.2.b",
            commandWord: "explain",
            text: "Explain what drives credit spreads.",
            importance: 2,
            questions: [
              {
                stem: "Which event would most likely widen the credit spread on a company's bonds?",
                correct: "A deterioration in the issuer's credit outlook.",
                wrong: ["An upgrade in the issuer's credit rating.", "A reduction in the issuer's leverage."],
                explanation: "Spreads compensate for default risk, so worse credit quality widens them.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "FI.2.c",
            commandWord: "describe",
            text: "Describe common yield curve shapes and what they imply.",
            importance: 2,
            questions: [],
          },
        ],
      },
    ],
  },
  {
    code: "DER",
    name: "Derivatives",
    weightMin: 5,
    weightMax: 8,
    difficulty: 3,
    spread: false,
    modules: [
      {
        title: "Forwards and futures",
        estMinutes: 180,
        los: [
          {
            code: "DER.1.a",
            commandWord: "describe",
            text: "Contrast forward and futures contracts.",
            importance: 2,
            questions: [
              {
                stem: "Compared with forward contracts, futures contracts are most likely to be:",
                correct: "standardized, exchange-traded and marked to market daily.",
                wrong: ["customized and traded over the counter.", "free of any counterparty risk."],
                explanation: "Futures are standardized and exchange-traded with daily settlement. A clearinghouse reduces, but does not eliminate, counterparty risk.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "DER.1.b",
            commandWord: "calculate",
            text: "Calculate a forward price for an asset with no income.",
            importance: 3,
            questions: [
              {
                stem: "A non-dividend-paying stock trades at 100. The risk-free rate is 5% per year. The no-arbitrage 1-year forward price is:",
                correct: "105.00.",
                wrong: ["95.24.", "100.00."],
                explanation: "F = S × (1 + r)ᵀ = 100 × 1.05 = 105.00.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "DER.1.c",
            commandWord: "explain",
            text: "Explain the basic structure of a plain-vanilla interest rate swap.",
            importance: 2,
            questions: [],
          },
        ],
      },
      {
        title: "Options",
        estMinutes: 210,
        los: [
          {
            code: "DER.2.a",
            commandWord: "calculate",
            text: "Calculate the payoff and profit of a long call option.",
            importance: 3,
            questions: [
              {
                stem: "An investor buys a call option with a strike of 50 for a premium of 3. At expiry the underlying trades at 58. The investor's profit is:",
                correct: "5.",
                wrong: ["8.", "3."],
                explanation: "Payoff = 58 − 50 = 8; profit = payoff − premium = 8 − 3 = 5.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "DER.2.b",
            commandWord: "explain",
            text: "Explain put-call parity for European options.",
            importance: 2,
            questions: [
              {
                stem: "Which expression represents put-call parity for European options on a non-dividend-paying stock (c = call, p = put, S = spot, PV(K) = present value of the strike)?",
                correct: "c + PV(K) = p + S",
                wrong: ["c + S = p + PV(K)", "c − p = PV(K) + S"],
                explanation: "A fiduciary call (call + bond worth PV(K)) has the same payoff as a protective put (put + stock): c + PV(K) = p + S.",
                difficulty: 3,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "ALT",
    name: "Alternative Investments",
    weightMin: 7,
    weightMax: 10,
    difficulty: 1,
    spread: false,
    modules: [
      {
        title: "Features of alternative investments",
        estMinutes: 150,
        los: [
          {
            code: "ALT.1.a",
            commandWord: "describe",
            text: "Describe the liquidity and fee characteristics of private equity and hedge funds.",
            importance: 2,
            questions: [
              {
                stem: "Relative to a public equity mutual fund, a private equity fund is most likely to offer:",
                correct: "illiquid holdings with limited investor redemption rights over several years.",
                wrong: ["daily liquidity for investors.", "no management fees."],
                explanation: "Private equity commitments are typically locked up for years and are illiquid.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "ALT.1.b",
            commandWord: "calculate",
            text: "Calculate investor returns net of management and performance fees.",
            importance: 2,
            questions: [
              {
                stem: "A fund with 100 million of assets earns a gross profit of 10 million. It charges a 2% management fee on assets and a 20% performance fee on profit after the management fee. The investors' net profit is:",
                correct: "6.4 million.",
                wrong: ["8.0 million.", "7.0 million."],
                explanation: "Management fee = 2.0; profit after it = 8.0; performance fee = 20% × 8.0 = 1.6. Net = 10 − 2.0 − 1.6 = 6.4 million.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
      {
        title: "Real assets",
        estMinutes: 150,
        los: [
          {
            code: "ALT.2.a",
            commandWord: "calculate",
            text: "Estimate property value using the direct capitalization approach.",
            importance: 2,
            questions: [
              {
                stem: "A property generates net operating income of 600,000 per year. If the market capitalization rate is 8%, its estimated value is:",
                correct: "7,500,000.",
                wrong: ["4,800,000.", "48,000,000."],
                explanation: "Value = NOI / cap rate = 600,000 / 0.08 = 7,500,000.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "ALT.2.b",
            commandWord: "describe",
            text: "Describe why investors allocate to commodities.",
            importance: 1,
            questions: [
              {
                stem: "Which is a main reason investors might add commodities to a diversified portfolio?",
                correct: "Potential diversification and inflation protection.",
                wrong: ["Guaranteed income.", "Absence of price volatility."],
                explanation: "Commodity returns often have low correlation with financial assets and can respond to inflation, but are volatile and pay no income.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "PM",
    name: "Portfolio Management",
    weightMin: 8,
    weightMax: 12,
    difficulty: 2,
    spread: false,
    modules: [
      {
        title: "Portfolio risk and return",
        estMinutes: 210,
        los: [
          {
            code: "PM.1.a",
            commandWord: "calculate",
            text: "Calculate the expected return of a portfolio.",
            importance: 2,
            questions: [
              {
                stem: "A portfolio is 60% in an asset expected to return 10% and 40% in an asset expected to return 6%. The portfolio's expected return is:",
                correct: "8.4%.",
                wrong: ["8.0%.", "16.0%."],
                explanation: "E(Rp) = 0.6 × 10% + 0.4 × 6% = 8.4%.",
                difficulty: 1,
              },
            ],
          },
          {
            code: "PM.1.b",
            commandWord: "explain",
            text: "Explain the diversification benefit when asset returns are not perfectly correlated.",
            importance: 3,
            questions: [
              {
                stem: "Two risky assets with a correlation below +1 are combined. The portfolio standard deviation will be:",
                correct: "less than the weighted average of the two standard deviations.",
                wrong: ["greater than the weighted average of the two standard deviations.", "equal to the weighted average of the two standard deviations."],
                explanation: "Only with perfect positive correlation is portfolio risk the weighted average; otherwise diversification reduces it.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "PM.1.c",
            commandWord: "calculate",
            text: "Calculate and interpret the Sharpe ratio.",
            importance: 3,
            questions: [
              {
                stem: "A portfolio returns 9% with a standard deviation of 12%. The risk-free rate is 3%. The Sharpe ratio is:",
                correct: "0.50.",
                wrong: ["0.75.", "2.00."],
                explanation: "Sharpe = (9% − 3%) / 12% = 0.50.",
                difficulty: 2,
              },
            ],
          },
        ],
      },
      {
        title: "CAPM and the investment policy statement",
        estMinutes: 180,
        los: [
          {
            code: "PM.2.a",
            commandWord: "calculate",
            text: "Calculate the required return on a stock using the CAPM.",
            importance: 3,
            questions: [
              {
                stem: "The risk-free rate is 3%, the market risk premium is 5% and a stock's beta is 1.2. The CAPM required return is:",
                correct: "9.0%.",
                wrong: ["8.0%.", "11.0%."],
                explanation: "r = 3% + 1.2 × 5% = 9.0%.",
                difficulty: 2,
              },
            ],
          },
          {
            code: "PM.2.b",
            commandWord: "describe",
            text: "Describe the components of an investment policy statement.",
            importance: 2,
            questions: [
              {
                stem: "Which of the following is least likely to be a component of an investment policy statement?",
                correct: "The portfolio manager's personal trading record.",
                wrong: ["Return and risk objectives.", "Constraints such as liquidity, time horizon and taxes."],
                explanation: "An IPS records the client's objectives and constraints, not the manager's personal trading.",
                difficulty: 1,
              },
            ],
          },
        ],
      },
    ],
  },
];

export const SAMPLE_STATS = {
  topics: SAMPLE_TOPICS.length,
  modules: SAMPLE_TOPICS.reduce((s, t) => s + t.modules.length, 0),
  los: SAMPLE_TOPICS.reduce((s, t) => s + t.modules.reduce((a, m) => a + m.los.length, 0), 0),
  questions: SAMPLE_TOPICS.reduce(
    (s, t) => s + t.modules.reduce((a, m) => a + m.los.reduce((b, l) => b + l.questions.length, 0), 0),
    0,
  ),
};
