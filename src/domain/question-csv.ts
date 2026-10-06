// Question-bank CSV: an RFC 4180 parser and writer, plus row validation for the admin import.
// Pure functions only (no I/O); the admin service resolves modules and writes to the database.
// Never trust the input: every field is length-limited, control characters are rejected, and
// anything the writer emits is safe to open in a spreadsheet (formula-injection guard).

export const QUESTION_CSV = {
  /** Largest file the import accepts (read client-side, sent as a string; well under the 4.5 MB action limit). */
  maxBytes: 900_000,
  /** Questions (data rows) per import. */
  maxRows: 500,
  maxStem: 2000,
  minStem: 10,
  maxOption: 500,
  maxExplanation: 4000,
  minExplanation: 5,
  maxSource: 80,
  /** Column order of the template and the export. */
  columns: [
    "module",
    "stem",
    "a",
    "b",
    "c",
    "d",
    "correct",
    "explanation",
    "difficulty",
    "source",
  ] as const,
};

export type QuestionColumn = (typeof QUESTION_CSV.columns)[number];

// --------------------------------------------------------------- RFC 4180

export type CsvRecord = {
  /** 1-based record number, blank records included (header = 1): what a spreadsheet shows as the row. */
  row: number;
  /** 1-based physical line where the record starts (differs from `row` after multi-line cells). */
  line: number;
  cells: string[];
};

export type CsvParse = { records: CsvRecord[]; error?: string };

/**
 * Parse CSV text. Handles a leading BOM, quoted fields with commas, newlines and `""` escapes,
 * and CRLF / LF / CR line endings. Lenient about stray quotes inside unquoted fields.
 * Fully blank records are kept (so row numbers stay true) with a single empty cell.
 */
export function parseCsv(input: string): CsvParse {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let recordLine = 1;
  let fieldStart = true; // at the first character of a field

  const endField = () => {
    cells.push(field);
    field = "";
    fieldStart = true;
  };
  const endRecord = () => {
    endField();
    records.push({ row: records.length + 1, line: recordLine, cells });
    cells = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        else if (ch === "\r") {
          // Count CRLF as one line break.
          if (text[i + 1] !== "\n") line++;
        }
        field += ch;
      }
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      quoteLine = line;
      fieldStart = false;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRecord();
      continue;
    }
    // Stray quote or any other character: literal.
    fieldStart = false;
    field += ch;
  }
  if (inQuotes)
    return {
      records: [],
      error: `A quoted cell that starts on line ${quoteLine} is never closed (missing closing quote).`,
    };
  // Last record without a trailing newline.
  if (field !== "" || cells.length > 0 || !fieldStart) endRecord();
  return { records };
}

/**
 * One cell, made safe for spreadsheets: text starting with = + - @ (or a tab / carriage return)
 * gets a leading apostrophe so it is never evaluated as a formula; quoted when needed.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with CRLF line endings; `bom` helps Excel read UTF-8. */
export function toCsv(
  rows: (string | number | null | undefined)[][],
  opts: { bom?: boolean } = {},
): string {
  return (
    (opts.bom ? "﻿" : "") +
    rows.map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

/** Undo the writer's formula guard so an exported file imports back unchanged. */
export function unguardCell(s: string): string {
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

// -------------------------------------------------------- module references

export type ModuleIndexEntry = {
  id: string;
  slug: string;
  number: number;
  topicCode: string;
  topicName: string;
};

export type ModuleIndex = {
  bySlug: Map<string, ModuleIndexEntry>;
  /** topic code (lower case) -> module number -> entry */
  byCode: Map<string, Map<number, ModuleIndexEntry>>;
  /** topic name (lower case, single spaces) -> module number -> entry */
  byName: Map<string, Map<number, ModuleIndexEntry>>;
};

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function buildModuleIndex(entries: ModuleIndexEntry[]): ModuleIndex {
  const idx: ModuleIndex = {
    bySlug: new Map(),
    byCode: new Map(),
    byName: new Map(),
  };
  for (const e of entries) {
    idx.bySlug.set(e.slug.toLowerCase(), e);
    for (const [map, key] of [
      [idx.byCode, e.topicCode.toLowerCase()],
      [idx.byName, squash(e.topicName)],
    ] as const) {
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(e.number, e);
    }
  }
  return idx;
}

export type ModuleResolution =
  | { ok: true; entry: ModuleIndexEntry }
  | { ok: false; error: string };

/**
 * Accepts a slug (`quantitative-methods-04`), a topic code and number (`QM 4`, `qm-04`, `QM4`),
 * or a topic name and number (`Quantitative Methods 4`).
 */
export function resolveModuleRef(
  raw: string,
  index: ModuleIndex,
): ModuleResolution {
  const ref = raw.trim();
  const hint =
    "Use a module slug like quantitative-methods-04, or a topic code and number like QM 4.";
  if (!ref) return { ok: false, error: `Module is empty. ${hint}` };
  if (ref.length > 120)
    return { ok: false, error: "Module reference is too long." };

  const slug = index.bySlug.get(ref.toLowerCase());
  if (slug) return { ok: true, entry: slug };

  const m = /^(.*?)[\s._:#-]*0*(\d{1,3})$/.exec(ref);
  if (m && m[1].trim()) {
    const number = Number(m[2]);
    const code = m[1].trim().toLowerCase();
    const nameKey = squash(m[1]);
    const topic = index.byCode.get(code) ?? index.byName.get(nameKey);
    if (topic) {
      const hit = topic.get(number);
      if (hit) return { ok: true, entry: hit };
      const nums = [...topic.keys()].sort((a, b) => a - b);
      const sample = [...topic.values()][0];
      return {
        ok: false,
        error: `${sample.topicName} has no module ${number} (it has ${nums[0]}–${nums[nums.length - 1]}).`,
      };
    }
  }
  return {
    ok: false,
    error: `Module "${ref.length > 40 ? `${ref.slice(0, 40)}…` : ref}" was not found in the active curriculum. ${hint}`,
  };
}

// ------------------------------------------------------------------ rows

export type QuestionDraft = {
  moduleId: string;
  moduleSlug: string;
  stem: string;
  options: { key: string; text: string }[];
  correctKey: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  /** Free-text provenance note from the file; recorded in the audit log, not on the question. */
  source: string;
};

export type RowIssue = {
  row: number;
  line: number;
  messages: string[];
  module: string;
  stem: string;
};

export type ParsedRow =
  | {
      ok: true;
      row: number;
      line: number;
      draft: QuestionDraft;
      module: string;
    }
  | {
      ok: false;
      row: number;
      line: number;
      errors: string[];
      module: string;
      stem: string;
    };

export type QuestionCsvParse = {
  /** Problems with the file as a whole (missing columns, too many rows…). When present, `rows` is empty. */
  fileErrors: string[];
  /** Soft notes, e.g. columns that are ignored. */
  fileWarnings: string[];
  rows: ParsedRow[];
};

const HEADER_ALIASES: Record<string, QuestionColumn> = {
  module: "module",
  module_slug: "module",
  chapter: "module",
  stem: "stem",
  question: "stem",
  a: "a",
  option_a: "a",
  b: "b",
  option_b: "b",
  c: "c",
  option_c: "c",
  d: "d",
  option_d: "d",
  correct: "correct",
  answer: "correct",
  correct_answer: "correct",
  explanation: "explanation",
  rationale: "explanation",
  difficulty: "difficulty",
  level: "difficulty",
  source: "source",
};
const REQUIRED: QuestionColumn[] = [
  "module",
  "stem",
  "a",
  "b",
  "c",
  "correct",
  "explanation",
  "difficulty",
];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Normalised text used to spot duplicate stems. */
export const stemKey = (stem: string) =>
  stem.toLowerCase().replace(/\s+/g, " ").trim();

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const multiLine = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/** Parse and validate a question CSV against the module index. Nothing here touches a database. */
export function parseQuestionCsv(
  text: string,
  index: ModuleIndex,
): QuestionCsvParse {
  const fail = (...fileErrors: string[]): QuestionCsvParse => ({
    fileErrors,
    fileWarnings: [],
    rows: [],
  });
  if (new TextEncoder().encode(text).length > QUESTION_CSV.maxBytes)
    return fail(
      `The file is larger than ${QUESTION_CSV.maxBytes / 1000} KB. Split it into smaller files.`,
    );
  if (!text.trim()) return fail("The file is empty.");

  const parsed = parseCsv(text);
  if (parsed.error) return fail(parsed.error);
  const [head, ...body] = parsed.records;
  if (!head) return fail("The file is empty.");

  if (head.cells.length === 1 && /[;\t]/.test(head.cells[0])) {
    return fail(
      "This looks like a semicolon- or tab-separated file. Save it as comma-separated CSV (UTF-8) and try again.",
    );
  }

  // Header -> column positions.
  const pos = new Map<QuestionColumn, number>();
  const ignored: string[] = [];
  const dupes: string[] = [];
  head.cells.forEach((cell, i) => {
    const key = cell
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (!key) return;
    const col = HEADER_ALIASES[key];
    if (!col) return void ignored.push(cell.trim().slice(0, 40));
    if (pos.has(col)) return void dupes.push(col);
    pos.set(col, i);
  });
  const missing = REQUIRED.filter((c) => !pos.has(c));
  const fileErrors: string[] = [];
  if (missing.length)
    fileErrors.push(
      `The header row is missing: ${missing.join(", ")}. Expected columns: ${QUESTION_CSV.columns.join(", ")}.`,
    );
  if (dupes.length)
    fileErrors.push(
      `The header repeats a column: ${[...new Set(dupes)].join(", ")}.`,
    );
  const data = body.filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (data.length === 0 && fileErrors.length === 0)
    fileErrors.push("The file has a header but no questions.");
  if (data.length > QUESTION_CSV.maxRows)
    fileErrors.push(
      `At most ${QUESTION_CSV.maxRows} questions per import (this file has ${data.length}). Split it into several files.`,
    );
  if (fileErrors.length) return fail(...fileErrors);

  const fileWarnings = ignored.length
    ? [`Ignored columns: ${[...new Set(ignored)].join(", ")}.`]
    : [];
  const cell = (r: CsvRecord, c: QuestionColumn) => {
    const i = pos.get(c);
    return i === undefined ? "" : unguardCell((r.cells[i] ?? "").trim());
  };

  const rows = data.map((r): ParsedRow => {
    const errors: string[] = [];
    const moduleRef = cell(r, "module");
    const stemRaw = cell(r, "stem");
    const bad = (m: string) => void errors.push(m);

    if (
      r.cells.length > head.cells.length &&
      r.cells.slice(head.cells.length).some((c) => c.trim())
    ) {
      bad(
        "Has more cells than the header row. A comma inside a cell must be wrapped in double quotes.",
      );
    }
    if (r.cells.some((c) => CONTROL.test(c)))
      bad("Contains control characters. Remove them and try again.");

    const mod = resolveModuleRef(moduleRef, index);
    if (!mod.ok) bad(mod.error);

    const stem = multiLine(stemRaw);
    if (stem.length < QUESTION_CSV.minStem)
      bad(`Stem is too short (at least ${QUESTION_CSV.minStem} characters).`);
    if (stem.length > QUESTION_CSV.maxStem)
      bad(
        `Stem is too long (${stem.length} characters; the limit is ${QUESTION_CSV.maxStem}).`,
      );

    const options: { key: string; text: string }[] = [];
    for (const [k, col] of [
      ["A", "a"],
      ["B", "b"],
      ["C", "c"],
      ["D", "d"],
    ] as const) {
      const t = oneLine(cell(r, col));
      if (!t) {
        if (k !== "D") bad(`Option ${k} is empty.`);
        continue;
      }
      if (t.length > QUESTION_CSV.maxOption)
        bad(
          `Option ${k} is too long (${t.length} characters; the limit is ${QUESTION_CSV.maxOption}).`,
        );
      options.push({ key: k, text: t });
    }
    const seen = new Set<string>();
    for (const o of options) {
      const key = o.text.toLowerCase();
      if (seen.has(key)) bad(`Option ${o.key} repeats another option.`);
      seen.add(key);
    }

    const correct = cell(r, "correct").toUpperCase();
    if (!/^[ABCD]$/.test(correct))
      bad(
        `"correct" must be A, B, C or D${correct ? ` (got "${cell(r, "correct").slice(0, 10)}")` : ""}.`,
      );
    else if (!options.some((o) => o.key === correct))
      bad(`The correct answer is ${correct}, but option ${correct} is empty.`);

    const explanation = multiLine(cell(r, "explanation"));
    if (explanation.length < QUESTION_CSV.minExplanation)
      bad("Explanation is missing. Students see it after answering.");
    if (explanation.length > QUESTION_CSV.maxExplanation)
      bad(
        `Explanation is too long (${explanation.length} characters; the limit is ${QUESTION_CSV.maxExplanation}).`,
      );

    const diffRaw = cell(r, "difficulty");
    const difficulty = /^[123]$/.test(diffRaw)
      ? (Number(diffRaw) as 1 | 2 | 3)
      : null;
    if (difficulty === null)
      bad(
        `Difficulty must be 1 (easy), 2 (medium) or 3 (hard)${diffRaw ? ` (got "${diffRaw.slice(0, 10)}")` : ""}.`,
      );

    const source = oneLine(cell(r, "source"));
    if (source.length > QUESTION_CSV.maxSource)
      bad(
        `Source is too long (the limit is ${QUESTION_CSV.maxSource} characters).`,
      );

    if (errors.length > 0 || !mod.ok || difficulty === null) {
      return {
        ok: false,
        row: r.row,
        line: r.line,
        errors,
        module: moduleRef.slice(0, 60),
        stem: stem.slice(0, 160),
      };
    }
    return {
      ok: true,
      row: r.row,
      line: r.line,
      module: moduleRef.slice(0, 60),
      draft: {
        moduleId: mod.entry.id,
        moduleSlug: mod.entry.slug,
        stem,
        options,
        correctKey: correct,
        explanation,
        difficulty,
        source,
      },
    };
  });
  return { fileErrors: [], fileWarnings, rows };
}

// -------------------------------------------------------------- duplicates

export type AnalysedRow =
  | {
      status: "ok";
      row: number;
      line: number;
      module: string;
      draft: QuestionDraft;
    }
  | {
      status: "duplicate";
      row: number;
      line: number;
      module: string;
      draft: QuestionDraft;
      of: "bank" | { row: number };
    }
  | {
      status: "error";
      row: number;
      line: number;
      module: string;
      stem: string;
      errors: string[];
    };

/** Key identifying a question within a module, for duplicate detection. */
export const duplicateKey = (moduleId: string, stem: string) =>
  `${moduleId}\u0000${stemKey(stem)}`;

/**
 * Flag rows whose stem already exists in the same module (in the bank, or earlier in this file).
 * `existing` holds `duplicateKey(...)` values for the bank. Invalid rows never claim a stem.
 */
export function markDuplicates(
  rows: ParsedRow[],
  existing: ReadonlySet<string>,
): AnalysedRow[] {
  const firstSeen = new Map<string, number>();
  return rows.map((r): AnalysedRow => {
    if (!r.ok)
      return {
        status: "error",
        row: r.row,
        line: r.line,
        module: r.module,
        stem: r.stem,
        errors: r.errors,
      };
    const key = duplicateKey(r.draft.moduleId, r.draft.stem);
    if (existing.has(key))
      return {
        status: "duplicate",
        row: r.row,
        line: r.line,
        module: r.module,
        draft: r.draft,
        of: "bank",
      };
    const first = firstSeen.get(key);
    if (first !== undefined)
      return {
        status: "duplicate",
        row: r.row,
        line: r.line,
        module: r.module,
        draft: r.draft,
        of: { row: first },
      };
    firstSeen.set(key, r.row);
    return {
      status: "ok",
      row: r.row,
      line: r.line,
      module: r.module,
      draft: r.draft,
    };
  });
}

export function summarise(rows: AnalysedRow[]) {
  let ok = 0;
  let duplicates = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.status === "ok") ok++;
    else if (r.status === "duplicate") duplicates++;
    else errors++;
  }
  return { total: rows.length, ok, duplicates, errors };
}

// ---------------------------------------------------------------- template

/** The downloadable template: header plus two worked examples (one 4-option, one 3-option). */
export function questionTemplateCsv(): string {
  const source = "Template example (delete this row)";
  return toCsv(
    [
      [...QUESTION_CSV.columns],
      [
        "quantitative-methods-01",
        "An investment rises from 80 to 100 over one year. What is the holding period return?",
        "20%",
        "25%",
        "80%",
        "125%",
        "B",
        "The return is (100 - 80) / 80 = 0.25, so 25%. Dividing by the ending value (20%) is a common slip.",
        1,
        source,
      ],
      [
        "ETH 1",
        "Which statement best describes the purpose of a code of ethics for investment professionals?",
        "It guarantees clients higher returns.",
        "It supports trust in the profession and protects client interests.",
        "It replaces the need for regulation.",
        "",
        "B",
        "Codes set expected behaviour, which supports trust and protects clients. They do not guarantee returns or replace regulation.",
        1,
        source,
      ],
    ],
    { bom: true },
  );
}
