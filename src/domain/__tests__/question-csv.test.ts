import { describe, expect, it } from "vitest";
import {
  QUESTION_CSV,
  buildModuleIndex,
  csvCell,
  duplicateKey,
  markDuplicates,
  parseCsv,
  parseQuestionCsv,
  resolveModuleRef,
  summarise,
  toCsv,
  unguardCell,
} from "../question-csv";

const index = buildModuleIndex([
  { id: "m-qm4", slug: "quantitative-methods-04", number: 4, topicCode: "QM", topicName: "Quantitative Methods" },
  { id: "m-qm5", slug: "quantitative-methods-05", number: 5, topicCode: "QM", topicName: "Quantitative Methods" },
  { id: "m-eth1", slug: "ethical-and-professional-standards-01", number: 1, topicCode: "ETH", topicName: "Ethical and Professional Standards" },
]);

const HEADER = "module,stem,a,b,c,d,correct,explanation,difficulty,source";
const row = (o: Partial<Record<string, string>> = {}) => {
  const v = {
    module: "QM 4",
    stem: "Which measure is the most appropriate here?",
    a: "Alpha",
    b: "Beta",
    c: "Gamma",
    d: "",
    correct: "B",
    explanation: "Beta is right because of the setup.",
    difficulty: "2",
    source: "",
    ...o,
  };
  return toCsv([QUESTION_CSV.columns.map((c) => v[c])]).trimEnd();
};
const file = (...rows: string[]) => [HEADER, ...rows].join("\r\n");

describe("parseCsv", () => {
  it("parses simple records with LF, CRLF and CR endings", () => {
    for (const nl of ["\n", "\r\n", "\r"]) {
      const r = parseCsv(`a,b${nl}1,2${nl}`);
      expect(r.records.map((x) => x.cells)).toEqual([["a", "b"], ["1", "2"]]);
    }
  });

  it("handles a missing final newline and trailing empty cells", () => {
    expect(parseCsv("a,b\n1,").records.map((x) => x.cells)).toEqual([["a", "b"], ["1", ""]]);
    expect(parseCsv("a,b\n1,2").records[1].cells).toEqual(["1", "2"]);
  });

  it("strips a BOM", () => {
    expect(parseCsv("﻿module,stem\n1,2").records[0].cells).toEqual(["module", "stem"]);
  });

  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    const r = parseCsv('a,b\n"x, y","say ""hi"""\n"line1\r\nline2",z\n');
    expect(r.records[1].cells).toEqual(["x, y", 'say "hi"']);
    expect(r.records[2].cells).toEqual(["line1\r\nline2", "z"]);
  });

  it("tracks rows and physical lines separately, keeping blank rows", () => {
    const r = parseCsv('h\n"a\nb"\n\nlast\n');
    expect(r.records.map((x) => [x.row, x.line])).toEqual([[1, 1], [2, 2], [3, 4], [4, 5]]);
    expect(r.records[2].cells).toEqual([""]);
  });

  it("reports an unterminated quote with its line", () => {
    const r = parseCsv('a,b\n1,"oops\n2,3');
    expect(r.error).toMatch(/line 2/);
    expect(r.records).toEqual([]);
  });

  it("treats stray quotes in unquoted cells as literal", () => {
    expect(parseCsv('5" pipe,ok').records[0].cells).toEqual(['5" pipe', "ok"]);
  });

  it("returns no records for empty input", () => {
    expect(parseCsv("").records).toEqual([]);
  });
});

describe("csv writer", () => {
  it("quotes only when needed and uses CRLF", () => {
    expect(toCsv([["a", "b,c", 'd"e', "f\ng"]])).toBe('a,"b,c","d""e","f\ng"\r\n');
  });

  it("guards formula-looking cells with an apostrophe", () => {
    for (const bad of ["=1+1", "+5", "-2", "@SUM(A1)", "\tcmd"]) expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell("-1.2%")).toBe("'-1.2%");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });

  it("round-trips through the parser and the import guard", () => {
    const cells = ["=HYPERLINK(\"x\")", "-1.2%", "a, b", 'q"uote', "multi\nline", "+3"];
    const back = parseCsv(toCsv([cells], { bom: true })).records[0].cells.map(unguardCell);
    expect(back).toEqual(cells);
  });

  it("only removes the apostrophe the writer adds", () => {
    expect(unguardCell("'=x")).toBe("=x");
    expect(unguardCell("'quoted")).toBe("'quoted");
  });
});

describe("resolveModuleRef", () => {
  const id = (s: string) => {
    const r = resolveModuleRef(s, index);
    return r.ok ? r.entry.id : r.error;
  };
  it("accepts slugs, codes with numbers, and topic names", () => {
    expect(id("quantitative-methods-04")).toBe("m-qm4");
    expect(id("  Quantitative-Methods-04 ")).toBe("m-qm4");
    for (const ref of ["QM 4", "qm4", "QM-04", "qm 04", "QM.4", "QM:4", "Quantitative Methods 4", "quantitative methods, 4".replace(",", "")]) {
      expect(id(ref)).toBe("m-qm4");
    }
    expect(id("ETH 1")).toBe("m-eth1");
    expect(id("Ethical and Professional Standards 1")).toBe("m-eth1");
  });
  it("explains unknown modules and out-of-range numbers", () => {
    expect(id("")).toMatch(/empty/);
    expect(id("ZZ 4")).toMatch(/not found/);
    expect(id("QM 9")).toMatch(/no module 9 \(it has 4–5\)/);
    expect(id("whatever")).toMatch(/not found/);
    expect(id("x".repeat(300))).toMatch(/too long/);
  });
});

describe("parseQuestionCsv", () => {
  it("parses a valid file, including a header with BOM and alias columns", () => {
    const r = parseQuestionCsv("﻿" + file(row(), row({ module: "ETH 1", stem: "Another perfectly fine stem?", d: "Delta", correct: "d" })), index);
    expect(r.fileErrors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    const [a, b] = r.rows;
    expect(a.ok && a.draft).toMatchObject({ moduleId: "m-qm4", correctKey: "B", difficulty: 2 });
    expect(a.ok && a.draft.options.map((o) => o.key)).toEqual(["A", "B", "C"]);
    expect(b.ok && b.draft).toMatchObject({ moduleId: "m-eth1", correctKey: "D" });
    const alias = parseQuestionCsv("chapter,question,option a,option b,option c,answer,rationale,level\nQM 4,A stem long enough,x,y,z,a,because,1", index);
    expect(alias.rows[0].ok).toBe(true);
  });

  it("allows a three-option question (d blank) but not a correct answer of an empty option", () => {
    expect(parseQuestionCsv(file(row({ d: "" })), index).rows[0].ok).toBe(true);
    const r = parseQuestionCsv(file(row({ d: "", correct: "D" })), index).rows[0];
    expect(!r.ok && r.errors.join(" ")).toMatch(/option D is empty/);
  });

  it("reports file-level problems", () => {
    expect(parseQuestionCsv("", index).fileErrors[0]).toMatch(/empty/);
    expect(parseQuestionCsv("module,stem\nQM 4,x", index).fileErrors[0]).toMatch(/missing: a, b, c, correct, explanation, difficulty/);
    expect(parseQuestionCsv(HEADER, index).fileErrors[0]).toMatch(/no questions/);
    expect(parseQuestionCsv(HEADER.replace("stem", "module"), index).fileErrors.join(" ")).toMatch(/repeats a column: module/);
    expect(parseQuestionCsv("module;stem;a;b;c;correct\nQM 4;x;1;2;3;a", index).fileErrors[0]).toMatch(/semicolon/);
    expect(parseQuestionCsv('a,b\n"x', index).fileErrors[0]).toMatch(/never closed/);
  });

  it("caps the number of rows and the file size", () => {
    const many = file(...Array.from({ length: QUESTION_CSV.maxRows + 1 }, (_, i) => row({ stem: `A distinct stem number ${i} for the cap` })));
    expect(parseQuestionCsv(many, index).fileErrors.join(" ")).toMatch(/At most 500/);
    const ok = file(...Array.from({ length: QUESTION_CSV.maxRows }, (_, i) => row({ stem: `A distinct stem number ${i} for the cap` })));
    const r = parseQuestionCsv(ok, index);
    expect(r.fileErrors).toEqual([]);
    expect(r.rows.every((x) => x.ok)).toBe(true);
    expect(parseQuestionCsv("x".repeat(QUESTION_CSV.maxBytes + 1), index).fileErrors[0]).toMatch(/larger than/);
  });

  it("validates every field with a specific message and the right row number", () => {
    const text = file(
      row(), // row 2 fine
      row({ module: "Nope 1" }), // 3
      row({ stem: "short" }), // 4
      row({ a: "" }), // 5
      row({ b: "Alpha" }), // 6 repeats A
      row({ correct: "E" }), // 7
      row({ correct: "" }), // 8
      row({ explanation: "" }), // 9
      row({ difficulty: "4" }), // 10
      row({ difficulty: "easy" }), // 11
      row({ stem: "s".repeat(QUESTION_CSV.maxStem + 1) }), // 12
      row({ a: "o".repeat(QUESTION_CSV.maxOption + 1) }), // 13
      row({ explanation: "e".repeat(QUESTION_CSV.maxExplanation + 1) }), // 14
      row({ source: "s".repeat(QUESTION_CSV.maxSource + 1) }), // 15
      row({ stem: "Has a control \u0007 character here" }), // 16
    );
    const r = parseQuestionCsv(text, index).rows;
    const errs = (n: number) => {
      const x = r.find((y) => y.row === n)!;
      return x.ok ? "" : x.errors.join(" | ");
    };
    expect(r.find((y) => y.row === 2)!.ok).toBe(true);
    expect(errs(3)).toMatch(/not found/);
    expect(errs(4)).toMatch(/Stem is too short/);
    expect(errs(5)).toMatch(/Option A is empty/);
    expect(errs(6)).toMatch(/repeats another option/);
    expect(errs(7)).toMatch(/must be A, B, C or D \(got "E"\)/);
    expect(errs(8)).toMatch(/must be A, B, C or D\./);
    expect(errs(9)).toMatch(/Explanation is missing/);
    expect(errs(10)).toMatch(/Difficulty must be 1/);
    expect(errs(11)).toMatch(/got "easy"/);
    expect(errs(12)).toMatch(/Stem is too long/);
    expect(errs(13)).toMatch(/Option A is too long/);
    expect(errs(14)).toMatch(/Explanation is too long/);
    expect(errs(15)).toMatch(/Source is too long/);
    expect(errs(16)).toMatch(/control characters/);
  });

  it("collects several errors on one row and flags extra cells", () => {
    const r = parseQuestionCsv(file(row({ module: "??", correct: "Z", difficulty: "9" }) + ",extra"), index).rows[0];
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
      expect(r.errors.join(" ")).toMatch(/more cells than the header/);
    }
  });

  it("skips blank rows without breaking row numbers, and accepts multi-line cells", () => {
    const text = file(row(), ",,,,,,,,,", "", row({ explanation: "Line one\nLine two is here", stem: "A second but different stem here" }), row({ module: "bad" }));
    const r = parseQuestionCsv(text, index).rows;
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.row)).toEqual([2, 5, 6]);
    const multi = r[1];
    expect(multi.ok && multi.draft.explanation).toBe("Line one\nLine two is here");
    const bad = r[2];
    expect(!bad.ok && bad.row).toBe(6);
  });

  it("restores guarded cells so an export imports unchanged", () => {
    const r = parseQuestionCsv(file(row({ a: "-1.2%", b: "+3.4%", c: "=2*2" })), index).rows[0];
    expect(r.ok && r.draft.options.map((o) => o.text)).toEqual(["-1.2%", "+3.4%", "=2*2"]);
  });

  it("normalises whitespace in options and line endings in text", () => {
    const r = parseQuestionCsv(file(row({ a: "  two   words ", explanation: "a\r\nb is long enough" })), index).rows[0];
    expect(r.ok && r.draft.options[0].text).toBe("two words");
    expect(r.ok && r.draft.explanation).toBe("a\nb is long enough");
  });
});

describe("markDuplicates", () => {
  it("flags stems already in the bank or earlier in the file, per module", () => {
    const parsed = parseQuestionCsv(
      file(
        row({ stem: "Existing question in the bank?" }), // 2: bank dup
        row({ stem: "Brand new question for the file?" }), // 3: ok
        row({ stem: "  brand NEW question  for the file? " }), // 4: dup of 3
        row({ stem: "Brand new question for the file?", module: "ETH 1" }), // 5: other module -> ok
        row({ module: "nope" }), // 6: error
      ),
      index,
    ).rows;
    const existing = new Set([duplicateKey("m-qm4", "existing QUESTION in the bank?")]);
    const out = markDuplicates(parsed, existing);
    expect(out.map((o) => o.status)).toEqual(["duplicate", "ok", "duplicate", "ok", "error"]);
    expect(out[0]).toMatchObject({ of: "bank" });
    expect(out[2]).toMatchObject({ of: { row: 3 } });
    expect(summarise(out)).toEqual({ total: 5, ok: 2, duplicates: 2, errors: 1 });
  });

  it("does not let an invalid row claim a stem", () => {
    const parsed = parseQuestionCsv(file(row({ stem: "Same stem used twice in a file?", correct: "Z" }), row({ stem: "Same stem used twice in a file?" })), index).rows;
    expect(markDuplicates(parsed, new Set()).map((o) => o.status)).toEqual(["error", "ok"]);
  });
});
