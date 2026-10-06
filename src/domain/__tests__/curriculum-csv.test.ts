import { describe, expect, it } from "vitest";
import {
  CSV_TEMPLATE,
  csvCell,
  curriculumToCsv,
  diffCurricula,
  diffIsEmpty,
  draftStats,
  firstWord,
  parseCsv,
  parseCurriculumCsv,
  REQUIRED_COLUMNS,
  type CurriculumShape,
} from "../curriculum-csv";

const HEADER = REQUIRED_COLUMNS.join(",");

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

const ROWS = [
  "ETH,Ethics,15,20,Module A,120,ETH.1.a,describe,Describe the duties owed to clients.,2",
  "ETH,Ethics,15,20,Module A,120,ETH.1.b,explain,Explain the standards.,3",
  "ETH,Ethics,15,20,Module B,90,ETH.2.a,compare,Compare two codes.,1",
  "QM,Quantitative Methods,6,9,Rates,240,QM.1.a,calculate,Calculate an effective annual rate.,2",
];

describe("parseCsv (RFC 4180)", () => {
  it("splits simple records", () => {
    const r = parseCsv("a,b,c\n1,2,3\n");
    expect(r.errors).toEqual([]);
    expect(r.records.map((x) => x.fields)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    const r = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",z\r\n');
    expect(r.errors).toEqual([]);
    expect(r.records.map((x) => x.fields)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["multi\nline", "z"],
    ]);
    expect(r.records.map((x) => x.line)).toEqual([1, 2, 3]);
  });

  it("strips a UTF-8 BOM and accepts CR-only and missing final newline", () => {
    const r = parseCsv("﻿a,b\r1,2");
    expect(r.records.map((x) => x.fields)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields, including a trailing empty field and an empty quoted field", () => {
    const r = parseCsv('a,,c,\n"",x,,\n');
    expect(r.records.map((x) => x.fields)).toEqual([
      ["a", "", "c", ""],
      ["", "x", "", ""],
    ]);
  });

  it("reports an unterminated quote", () => {
    const r = parseCsv('a,b\n"open,1\n');
    expect(r.errors[0].message).toMatch(/never closed/);
    expect(r.errors[0].row).toBe(2);
  });

  it("reports stray quotes and text after a closing quote", () => {
    expect(parseCsv('a,b"c\n').errors[0].message).toMatch(/middle of an unquoted field/);
    expect(parseCsv('"a"b,c\n').errors[0].message).toMatch(/after a closing quote/);
  });

  it("supports another delimiter", () => {
    expect(parseCsv("a;b\n1;2", ";").records[1].fields).toEqual(["1", "2"]);
  });

  it("csvCell quotes only when needed and round-trips", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell(" lead")).toBe('" lead"');
    const line = ["x", 'a "b", c', "multi\nline"].map(csvCell).join(",");
    expect(parseCsv(line).records[0].fields).toEqual(["x", 'a "b", c', "multi\nline"]);
  });
});

describe("parseCurriculumCsv", () => {
  it("groups rows into topics, modules and objectives in first-seen order", () => {
    const r = parseCurriculumCsv(csv(...ROWS), { name: "2027 official", year: 2027 });
    expect(r.errors).toEqual([]);
    expect(r.draft.name).toBe("2027 official");
    expect(r.draft.year).toBe(2027);
    expect(r.draft.isSample).toBe(false);
    expect(r.draft.topics.map((t) => t.code)).toEqual(["ETH", "QM"]);
    const eth = r.draft.topics[0];
    expect(eth).toMatchObject({ name: "Ethics", weightMin: 15, weightMax: 20, difficulty: 2, spread: false });
    expect(eth.modules.map((m) => [m.title, m.estMinutes, m.los.length])).toEqual([
      ["Module A", 120, 2],
      ["Module B", 90, 1],
    ]);
    expect(eth.modules[0].los[1]).toEqual({ code: "ETH.1.b", commandWord: "explain", text: "Explain the standards.", importance: 3 });
    expect(draftStats(r.draft)).toEqual({ topics: 2, modules: 3, los: 4 });
    // Clean draft: no accumulator fields leak out.
    expect(Object.keys(eth).sort()).toEqual(["code", "difficulty", "modules", "name", "spread", "weightMax", "weightMin"]);
    expect(Object.keys(eth.modules[0]).sort()).toEqual(["estMinutes", "los", "title"]);
  });

  it("accepts a BOM, CRLF, header case/spaces, reordered columns and quoted text", () => {
    const header = "LOS Code,Topic Code,topic_name,Weight_Min,weight_max,module_title,est_minutes,command_word,los_text,importance";
    const text = `﻿${header}\r\nQM.1.a,QM,Quant,6,9,"Rates, returns",60,calculate,"Calculate a ""real"" rate, given inflation.",2\r\n`;
    const r = parseCurriculumCsv(text);
    expect(r.errors).toEqual([]);
    const m = r.draft.topics[0].modules[0];
    expect(m.title).toBe("Rates, returns");
    expect(m.los[0]).toMatchObject({ code: "QM.1.a", text: 'Calculate a "real" rate, given inflation.' });
  });

  it("reads optional topic_difficulty and topic_spread columns", () => {
    const text = [
      `${HEADER},topic_difficulty,topic_spread`,
      "ETH,Ethics,15,20,M,60,E.1,describe,Describe x.,2,3,yes",
      "ETH,Ethics,15,20,M,60,E.2,describe,Describe y.,2,,",
    ].join("\n");
    const r = parseCurriculumCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.draft.topics[0]).toMatchObject({ difficulty: 3, spread: true });
  });

  it("detects semicolon-delimited files", () => {
    const text = [REQUIRED_COLUMNS.join(";"), "QM;Quant;6;9;M;60;QM.1;calculate;Calculate x.;2"].join("\n");
    const r = parseCurriculumCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.draft.topics[0].modules[0].los[0].code).toBe("QM.1");
  });

  it("uses defaults for blank est_minutes, importance and command_word (with a warning)", () => {
    const r = parseCurriculumCsv(csv("QM,Quant,6,9,M,,QM.1,,Interpret a p-value.,"));
    expect(r.errors).toEqual([]);
    expect(r.draft.topics[0].modules[0]).toMatchObject({ estMinutes: 180 });
    expect(r.draft.topics[0].modules[0].los[0]).toMatchObject({ commandWord: "interpret", importance: 2 });
    expect(r.warnings.some((w) => w.row === 2 && /command_word is blank/.test(w.message))).toBe(true);
  });

  it("skips blank lines without shifting row numbers", () => {
    const r = parseCurriculumCsv(csv(ROWS[0], "", ",,,,,,,,,", "ETH,Ethics,15,20,Module A,120,ETH.1.a,describe,Dup.,2"));
    expect(r.errors).toEqual([{ row: 5, message: 'los_code "ETH.1.a" is a duplicate of row 2.' }]);
  });

  it("rejects an empty file, a header-only file and missing columns", () => {
    expect(parseCurriculumCsv("  \n").errors[0].message).toMatch(/empty/);
    expect(parseCurriculumCsv(HEADER + "\n").errors[0].message).toMatch(/no objectives/);
    const r = parseCurriculumCsv("topic_code,topic_name\nA,B\n");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row).toBe(1);
    expect(r.errors[0].message).toMatch(/Missing columns: weight_min, weight_max, module_title/);
    expect(r.draft.topics).toEqual([]);
  });

  it("flags duplicated and unknown columns", () => {
    const r = parseCurriculumCsv(`${HEADER},notes,topic_code\nQM,Quant,6,9,M,60,QM.1,calculate,Calculate x.,2,hi,QM`);
    expect(r.errors.some((e) => /"topic_code" appears more than once/.test(e.message))).toBe(true);
    expect(r.warnings.some((w) => /unknown column: notes/.test(w.message))).toBe(true);
  });

  it("requires fields, with row numbers", () => {
    const r = parseCurriculumCsv(csv(",Ethics,15,20,M,60,E.1,describe,Describe.,2", "ETH,Ethics,15,20,,60,,describe,,2"));
    expect(r.errors).toEqual([
      { row: 2, message: "topic_code is required." },
      { row: 3, message: "module_title is required." },
      { row: 3, message: "los_code is required." },
      { row: 3, message: "los_text is required." },
    ]);
  });

  it("validates numeric ranges", () => {
    const r = parseCurriculumCsv(
      csv(
        "A,Alpha,-1,20,M,60,A.1,describe,Describe.,2",
        "B,Beta,10,101,M,60,B.1,describe,Describe.,2",
        "C,Gamma,12,8,M,60,C.1,describe,Describe.,2",
        "D,Delta,1,2,M,0,D.1,describe,Describe.,2",
        "E,Eps,1,2,M,abc,E.1,describe,Describe.,4",
        "F,Phi,1.5,2,M,60,F.1,describe,Describe.,2",
      ),
    );
    const byRow = (row: number) => r.errors.filter((e) => e.row === row).map((e) => e.message);
    expect(byRow(2)).toEqual(['weight_min must be a whole number from 0 to 100 (got "-1").']);
    expect(byRow(3)).toEqual(['weight_max must be a whole number from 0 to 100 (got "101").']);
    expect(byRow(4)).toEqual(["weight_min (12) is greater than weight_max (8)."]);
    expect(byRow(5)).toEqual(['est_minutes must be a whole number from 1 to 6000 (got "0").']);
    expect(byRow(6)).toEqual(['est_minutes must be a whole number from 1 to 6000 (got "abc").', 'importance must be 1, 2 or 3 (got "4").']);
    expect(byRow(7)[0]).toMatch(/weight_min must be a whole number/);
    // Invalid rows are not added to the draft.
    expect(r.draft.topics).toEqual([]);
  });

  it("validates optional columns", () => {
    const r = parseCurriculumCsv(`${HEADER},topic_difficulty,topic_spread\nA,Alpha,1,2,M,60,A.1,describe,Describe.,2,5,maybe`);
    expect(r.errors.map((e) => e.message)).toEqual(['topic_difficulty must be 1, 2 or 3 (got "5").', 'topic_spread must be true or false (got "maybe").']);
  });

  it("rejects duplicate LOS codes case-insensitively", () => {
    const r = parseCurriculumCsv(csv(ROWS[0], "ETH,Ethics,15,20,Module B,90,eth.1.A,describe,Describe again.,2"));
    expect(r.errors).toEqual([{ row: 3, message: 'los_code "eth.1.A" is a duplicate of row 2.' }]);
  });

  it("rejects codes with spaces", () => {
    const r = parseCurriculumCsv(csv('"ET H",Ethics,15,20,M,60,"E 1",describe,Describe.,2'));
    expect(r.errors.map((e) => e.message)).toEqual([
      'topic_code "ET H" must be at most 40 characters with no spaces.',
      'los_code "E 1" must be at most 40 characters with no spaces.',
    ]);
  });

  it("requires consistent topic names and weights across rows", () => {
    const r = parseCurriculumCsv(
      csv(ROWS[0], "ETH,Ethics & Standards,15,20,Module A,120,ETH.1.b,explain,Explain.,2", "ETH,Ethics,10,15,Module A,120,ETH.1.c,explain,Explain.,2"),
    );
    expect(r.errors).toEqual([
      { row: 3, message: 'Topic ETH is named "Ethics & Standards" here but "Ethics" on row 2.' },
      { row: 4, message: "Topic ETH has weights 10–15 here but 15–20 on row 2." },
    ]);
  });

  it("rejects topic codes that differ only by case", () => {
    const r = parseCurriculumCsv(csv(ROWS[0], "eth,Ethics,15,20,Module A,120,ETH.9,explain,Explain.,2"));
    expect(r.errors[0].message).toMatch(/differs only in letter case/);
  });

  it("flags inconsistent optional topic values", () => {
    const text = [`${HEADER},topic_difficulty`, "A,Alpha,1,2,M,60,A.1,describe,Describe.,2,1", "A,Alpha,1,2,M,60,A.2,describe,Describe.,2,3"].join("\n");
    expect(parseCurriculumCsv(text).errors[0].message).toMatch(/topic_difficulty 3 here but 1 earlier/);
  });

  it("warns when a module's est_minutes differs or the module is split", () => {
    const r = parseCurriculumCsv(
      csv(
        "ETH,Ethics,15,20,Module A,120,E.1,describe,Describe.,2",
        "ETH,Ethics,15,20,Module B,60,E.2,describe,Describe.,2",
        "ETH,Ethics,15,20,module a,90,E.3,describe,Describe.,2",
      ),
    );
    expect(r.errors).toEqual([]);
    const msgs = r.warnings.filter((w) => w.row === 4).map((w) => w.message);
    expect(msgs[0]).toMatch(/continues after other modules/);
    expect(msgs[1]).toMatch(/est_minutes 90 here but 120/);
    expect(r.draft.topics[0].modules.map((m) => m.los.map((l) => l.code))).toEqual([["E.1", "E.3"], ["E.2"]]);
  });

  it("warns when the command word isn't the first word of the objective", () => {
    const r = parseCurriculumCsv(csv("QM,Quant,6,9,M,60,QM.1,Calculate,Explain why rates differ.,2"));
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.row === 2)).toEqual([{ row: 2, message: 'command_word "calculate" is not the first word of the objective ("explain").' }]);
    // Stored lower-case.
    expect(r.draft.topics[0].modules[0].los[0].commandWord).toBe("calculate");
  });

  it("warns (not errors) when weight ranges can't add up to 100%", () => {
    const low = parseCurriculumCsv(csv("A,Alpha,10,20,M,60,A.1,describe,Describe.,2"));
    expect(low.errors).toEqual([]);
    expect(low.warnings.map((w) => w.message)).toContain("Topic maximum weights add up to 20%, which is less than 100%.");
    const high = parseCurriculumCsv(csv("A,Alpha,60,70,M,60,A.1,describe,Describe.,2", "B,Beta,50,60,M,60,B.1,describe,Describe.,2"));
    expect(high.warnings.map((w) => w.message)).toContain("Topic minimum weights add up to 110%, which is more than 100%.");
    const ok = parseCurriculumCsv(csv("A,Alpha,40,60,M,60,A.1,describe,Describe.,2", "B,Beta,40,60,M,60,B.1,describe,Describe.,2"));
    expect(ok.warnings).toEqual([]);
  });

  it("warns about a short row", () => {
    const r = parseCurriculumCsv(csv("A,Alpha,40,60,M,60,A.1,describe,Describe.")); // no importance column
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContainEqual({ row: 2, message: "Expected 10 values but found 9. Check for an unquoted comma." });
  });

  it("maps CSV syntax errors to spreadsheet rows", () => {
    const r = parseCurriculumCsv(csv('A,Alpha,40,60,"Multi\nline module",60,A.1,describe,Describe.,2', 'B,Beta,40,60,M,60,B.1,describe,Desc"ribe.,2'));
    // The broken record starts on physical line 4 but is spreadsheet row 3.
    expect(r.errors[0]).toMatchObject({ row: 3 });
    expect(r.errors[0].message).toMatch(/middle of an unquoted field/);
  });

  it("caps the number of errors", () => {
    const rows = Array.from({ length: 50 }, (_, i) => `A,Alpha,1,2,M,60,A.${i},describe,,2`);
    expect(parseCurriculumCsv(csv(...rows), { maxErrors: 10 }).errors).toHaveLength(10);
  });

  it("parses the bundled template and round-trips through curriculumToCsv", () => {
    const t = parseCurriculumCsv(CSV_TEMPLATE);
    expect(t.errors).toEqual([]);
    expect(draftStats(t.draft)).toEqual({ topics: 2, modules: 2, los: 3 });
    expect(t.draft.topics[0].modules[0].los[1].text).toContain('"quoted"');
    const again = parseCurriculumCsv(curriculumToCsv(t.draft));
    expect(again.errors).toEqual([]);
    expect(again.draft.topics).toEqual(t.draft.topics);
  });
});

describe("firstWord", () => {
  it("lower-cases and stops at punctuation", () => {
    expect(firstWord("  Calculate, and interpret")).toBe("calculate");
    expect(firstWord("Cost-benefit thinking")).toBe("cost-benefit");
    expect(firstWord("1. Describe")).toBe("");
  });
});

describe("diffCurricula", () => {
  const base: CurriculumShape = {
    topics: [
      {
        code: "ETH",
        name: "Ethics",
        weightMin: 15,
        weightMax: 20,
        modules: [
          {
            title: "Module A",
            los: [
              { code: "ETH.1.a", commandWord: "describe", text: "Describe duties." },
              { code: "ETH.1.b", commandWord: "explain", text: "Explain standards." },
            ],
          },
        ],
      },
      { code: "QM", name: "Quant", weightMin: 6, weightMax: 9, modules: [{ title: "Rates", los: [{ code: "QM.1", commandWord: "calculate", text: "Calculate EAR." }] }] },
      { code: "OLD", name: "Retired", weightMin: 1, weightMax: 2, modules: [{ title: "Gone", los: [{ code: "OLD.1", commandWord: "list", text: "List things." }] }] },
    ],
  };

  it("is empty for identical curricula (ignoring whitespace and code case)", () => {
    const same: CurriculumShape = JSON.parse(JSON.stringify(base));
    same.topics[0].modules[0].los[0].text = "  Describe   duties. ";
    same.topics[0].modules[0].los[1].code = "eth.1.B";
    const d = diffCurricula(base, same);
    expect(diffIsEmpty(d)).toBe(true);
    expect(d.unchangedLos).toBe(4);
  });

  it("reports added, removed, reworded and moved objectives and topic changes", () => {
    const next: CurriculumShape = {
      topics: [
        {
          code: "ETH",
          name: "Ethical and Professional Standards",
          weightMin: 10,
          weightMax: 15,
          modules: [
            {
              title: "Module A",
              los: [
                { code: "ETH.1.a", commandWord: "describe", text: "Describe the duties owed to clients." },
                { code: "ETH.1.c", commandWord: "apply", text: "Apply the code." },
              ],
            },
            { title: "Module B", los: [{ code: "ETH.1.b", commandWord: "explain", text: "Explain standards." }] },
          ],
        },
        { code: "QM", name: "Quant", weightMin: 6, weightMax: 9, modules: [{ title: "Rates", los: [{ code: "QM.1", commandWord: "interpret", text: "Calculate EAR." }] }] },
        { code: "NEW", name: "Data science", weightMin: 2, weightMax: 4, modules: [{ title: "AI", los: [{ code: "NEW.1", commandWord: "describe", text: "Describe LLMs." }] }] },
      ],
    };
    const d = diffCurricula(base, next);
    expect(d.addedLos.map((l) => l.code).sort()).toEqual(["ETH.1.c", "NEW.1"]);
    expect(d.addedLos.find((l) => l.code === "NEW.1")).toEqual({ code: "NEW.1", text: "Describe LLMs.", topicCode: "NEW", moduleTitle: "AI" });
    expect(d.removedLos).toEqual([{ code: "OLD.1", text: "List things.", topicCode: "OLD", moduleTitle: "Gone" }]);
    expect(d.rewordedLos.map((l) => l.code).sort()).toEqual(["ETH.1.a", "QM.1"]);
    expect(d.rewordedLos.find((l) => l.code === "ETH.1.a")).toMatchObject({ oldText: "Describe duties.", newText: "Describe the duties owed to clients." });
    expect(d.rewordedLos.find((l) => l.code === "QM.1")).toMatchObject({ oldCommandWord: "calculate", newCommandWord: "interpret" });
    expect(d.movedLos).toEqual([{ code: "ETH.1.b", from: "ETH / Module A", to: "ETH / Module B" }]);
    expect(d.addedTopics).toEqual([{ code: "NEW", name: "Data science", weightMin: 2, weightMax: 4 }]);
    expect(d.removedTopics).toEqual([{ code: "OLD", name: "Retired" }]);
    expect(d.topicChanges).toEqual([{ code: "ETH", oldName: "Ethics", newName: "Ethical and Professional Standards", oldWeight: [15, 20], newWeight: [10, 15] }]);
    expect(d.unchangedLos).toBe(0);
    expect(diffIsEmpty(d)).toBe(false);
  });

  it("treats everything as added when there is no previous version", () => {
    const d = diffCurricula({ topics: [] }, base);
    expect(d.addedLos).toHaveLength(4);
    expect(d.addedTopics).toHaveLength(3);
    expect(d.removedLos).toEqual([]);
  });
});
