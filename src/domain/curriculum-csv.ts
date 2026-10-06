// Curriculum CSV importer and version diff. Pure: no I/O, no framework imports.
//
// One row per learning objective (LOS). Topic and module columns repeat on
// every row; the importer groups rows into topics → modules → objectives in
// the order they first appear.

import type { CurriculumDraft } from "@/db/curriculum-writer";

export type { CurriculumDraft };

export type CsvIssue = { row: number; message: string };

export type ParseResult = {
  draft: CurriculumDraft;
  /** Blocking problems. A draft with errors must not be imported. */
  errors: CsvIssue[];
  /** Worth a look, but importable. `row` 0 means "whole file". */
  warnings: CsvIssue[];
};

export type ParseOptions = {
  name?: string;
  year?: number;
  level?: string;
  sourceNote?: string | null;
  /** Stop collecting errors after this many (the file is clearly wrong). */
  maxErrors?: number;
};

export const REQUIRED_COLUMNS = [
  "topic_code",
  "topic_name",
  "weight_min",
  "weight_max",
  "module_title",
  "est_minutes",
  "los_code",
  "command_word",
  "los_text",
  "importance",
] as const;
export const OPTIONAL_COLUMNS = ["topic_difficulty", "topic_spread"] as const;
const ALL_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

type Column = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

export const DEFAULT_EST_MINUTES = 180;
export const DEFAULT_IMPORTANCE = 2;
export const DEFAULT_TOPIC_DIFFICULTY = 2;
const MAX_TEXT = 2000;
const MAX_NAME = 200;
const MAX_CODE = 40;

// ------------------------------------------------------------------- CSV

export type CsvRecord = { line: number; fields: string[] };

/**
 * RFC 4180 CSV reader. Handles quoted fields with embedded commas, quotes ("")
 * and newlines; CRLF, LF or CR record endings; a leading UTF-8 BOM. `line` is
 * the physical line on which each record starts (1-based).
 */
export function parseCsv(text: string, delimiter = ","): { records: CsvRecord[]; errors: CsvIssue[] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  const errors: CsvIssue[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let i = 0;
  let inQuotes = false;
  let quotedField = false; // current field was quoted and the closing quote was seen
  const n = src.length;

  const endField = () => {
    fields.push(field);
    field = "";
    quotedField = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  while (i < n) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        quotedField = true;
        i++;
        continue;
      }
      if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.length === 0 && !quotedField) {
        inQuotes = true;
        i++;
        continue;
      }
      errors.push({ row: recordLine, message: "A quote appears in the middle of an unquoted field. Wrap the whole field in quotes and double any inner quotes (\"\")." });
      field += c;
      i++;
      continue;
    }
    if (c === delimiter) {
      endField();
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRecord();
      i += c === "\r" && src[i + 1] === "\n" ? 2 : 1;
      line++;
      recordLine = line;
      continue;
    }
    if (quotedField) {
      // Text after a closing quote, e.g. "abc"def — keep it, but flag the row once.
      if (!errors.some((e) => e.row === recordLine && e.message.startsWith("Unexpected text"))) {
        errors.push({ row: recordLine, message: "Unexpected text after a closing quote." });
      }
    }
    field += c;
    i++;
  }
  if (inQuotes) {
    errors.push({ row: recordLine, message: "A quoted field is never closed (missing \")." });
  }
  // Final record (no trailing newline), unless the file ended exactly on a newline.
  if (field.length > 0 || fields.length > 0 || quotedField || inQuotes) endRecord();
  return { records, errors };
}

/** Escape one value for CSV output. */
export function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  // Spreadsheets in some locales export with semicolons.
  if (!firstLine.includes(",") && firstLine.includes(";")) return ";";
  return ",";
}

const normHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- import

type Num = { ok: true; value: number } | { ok: false };
function int(raw: string): Num {
  const s = raw.trim();
  if (!/^[+-]?\d+(\.0+)?$/.test(s)) return { ok: false };
  return { ok: true, value: Number.parseInt(s, 10) };
}

function bool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "" || s === "false" || s === "no" || s === "n" || s === "0") return s === "" ? null : false;
  if (s === "true" || s === "yes" || s === "y" || s === "1") return true;
  return null;
}

/** First word of an objective, lower-cased and stripped of punctuation. */
export function firstWord(text: string): string {
  const m = collapse(text).match(/^[A-Za-z][A-Za-z-]*/);
  return m ? m[0].toLowerCase() : "";
}

type TopicAcc = CurriculumDraft["topics"][number] & { row: number; difficultySet: boolean; spreadSet: boolean };
type ModuleAcc = CurriculumDraft["topics"][number]["modules"][number] & { row: number };

/**
 * Parse a curriculum CSV into a draft version. Never throws: problems are
 * returned as row-numbered errors (blocking) and warnings. Row numbers match a
 * spreadsheet: the header is row 1.
 */
export function parseCurriculumCsv(text: string, opts: ParseOptions = {}): ParseResult {
  const maxErrors = opts.maxErrors ?? 200;
  const draft: CurriculumDraft = {
    name: opts.name?.trim() || "Imported curriculum",
    level: opts.level ?? "I",
    year: opts.year ?? new Date().getUTCFullYear(),
    isSample: false,
    sourceNote: opts.sourceNote ?? null,
    topics: [],
  };
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  const err = (row: number, message: string) => {
    if (errors.length < maxErrors) errors.push({ row, message });
  };
  const warn = (row: number, message: string) => {
    if (warnings.length < maxErrors) warnings.push({ row, message });
  };

  if (!text.trim()) {
    err(0, "The file is empty.");
    return { draft, errors, warnings };
  }

  const { records, errors: csvErrors } = parseCsv(text, detectDelimiter(text));
  // Map physical lines to spreadsheet rows (record index + 1).
  const rowOfLine = new Map(records.map((r, idx) => [r.line, idx + 1]));
  for (const e of csvErrors) err(rowOfLine.get(e.row) ?? e.row, e.message);

  const [header, ...body] = records;
  const cols = header.fields.map(normHeader);
  const index = new Map<string, number>();
  cols.forEach((c, i) => {
    if (!c) return;
    if (index.has(c)) err(1, `Column "${c}" appears more than once.`);
    else index.set(c, i);
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  if (missing.length) {
    err(1, `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template for the expected header.`);
    return { draft, errors, warnings };
  }
  const unknown = cols.filter((c) => c && !ALL_COLUMNS.includes(c));
  if (unknown.length) warn(1, `Ignoring unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`);

  const topicByCode = new Map<string, TopicAcc>();
  const moduleByKey = new Map<string, ModuleAcc>();
  const losRowByCode = new Map<string, number>();
  let dataRows = 0;

  body.forEach((rec, idx) => {
    const row = idx + 2;
    if (rec.fields.every((f) => f.trim() === "")) return; // blank line
    dataRows++;
    if (rec.fields.length !== cols.length) {
      warn(row, `Expected ${cols.length} values but found ${rec.fields.length}. Check for an unquoted comma.`);
    }
    const get = (c: Column) => {
      const i = index.get(c);
      return i === undefined ? "" : collapse(rec.fields[i] ?? "");
    };
    const before = errors.length;

    const topicCode = get("topic_code");
    const topicName = get("topic_name");
    const moduleTitle = get("module_title");
    const losCode = get("los_code");
    const losText = get("los_text");
    for (const [c, v] of [
      ["topic_code", topicCode],
      ["topic_name", topicName],
      ["weight_min", get("weight_min")],
      ["weight_max", get("weight_max")],
      ["module_title", moduleTitle],
      ["los_code", losCode],
      ["los_text", losText],
    ] as const) {
      if (!v) err(row, `${c} is required.`);
    }
    if (topicCode.length > MAX_CODE || /\s/.test(topicCode)) err(row, `topic_code "${topicCode}" must be at most ${MAX_CODE} characters with no spaces.`);
    if (losCode.length > MAX_CODE || /\s/.test(losCode)) err(row, `los_code "${losCode}" must be at most ${MAX_CODE} characters with no spaces.`);
    if (topicName.length > MAX_NAME) err(row, `topic_name is longer than ${MAX_NAME} characters.`);
    if (moduleTitle.length > MAX_NAME) err(row, `module_title is longer than ${MAX_NAME} characters.`);
    if (losText.length > MAX_TEXT) err(row, `los_text is longer than ${MAX_TEXT} characters.`);

    const wMinRaw = get("weight_min");
    const wMaxRaw = get("weight_max");
    const wMin = int(wMinRaw);
    const wMax = int(wMaxRaw);
    if (wMinRaw && (!wMin.ok || wMin.value < 0 || wMin.value > 100)) err(row, `weight_min must be a whole number from 0 to 100 (got "${wMinRaw}").`);
    if (wMaxRaw && (!wMax.ok || wMax.value < 0 || wMax.value > 100)) err(row, `weight_max must be a whole number from 0 to 100 (got "${wMaxRaw}").`);
    if (wMin.ok && wMax.ok && wMin.value > wMax.value) err(row, `weight_min (${wMin.value}) is greater than weight_max (${wMax.value}).`);

    const estRaw = get("est_minutes");
    const est = estRaw ? int(estRaw) : ({ ok: true, value: DEFAULT_EST_MINUTES } as Num);
    if (!est.ok || est.value < 1 || est.value > 6000) err(row, `est_minutes must be a whole number from 1 to 6000 (got "${estRaw}").`);

    const impRaw = get("importance");
    const imp = impRaw ? int(impRaw) : ({ ok: true, value: DEFAULT_IMPORTANCE } as Num);
    if (!imp.ok || imp.value < 1 || imp.value > 3) err(row, `importance must be 1, 2 or 3 (got "${impRaw}").`);

    const diffRaw = get("topic_difficulty");
    const diff = diffRaw ? int(diffRaw) : ({ ok: true, value: DEFAULT_TOPIC_DIFFICULTY } as Num);
    if (!diff.ok || diff.value < 1 || diff.value > 3) err(row, `topic_difficulty must be 1, 2 or 3 (got "${diffRaw}").`);

    const spreadRaw = get("topic_spread");
    const spread = bool(spreadRaw);
    if (spreadRaw && spread === null) err(row, `topic_spread must be true or false (got "${spreadRaw}").`);

    let command = get("command_word").toLowerCase();
    const lead = firstWord(losText);
    if (!command && lead) {
      command = lead;
      warn(row, `command_word is blank; using "${lead}" from the objective text.`);
    } else if (command && lead && command !== lead) {
      warn(row, `command_word "${command}" is not the first word of the objective ("${lead}").`);
    }
    if (!command && losText) err(row, "command_word is required (the objective text doesn't start with a word).");

    if (losCode) {
      const seen = losRowByCode.get(losCode.toLowerCase());
      if (seen !== undefined) err(row, `los_code "${losCode}" is a duplicate of row ${seen}.`);
      else losRowByCode.set(losCode.toLowerCase(), row);
    }

    if (errors.length > before || !wMin.ok || !wMax.ok || !est.ok || !imp.ok || !diff.ok) return;

    // ---- group
    let topic = topicByCode.get(topicCode);
    if (!topic) {
      for (const t of topicByCode.values()) {
        if (t.code.toLowerCase() === topicCode.toLowerCase()) err(row, `topic_code "${topicCode}" differs only in letter case from "${t.code}" (row ${t.row}).`);
      }
      topic = {
        row,
        code: topicCode,
        name: topicName,
        weightMin: wMin.value,
        weightMax: wMax.value,
        difficulty: diff.value,
        spread: spread ?? false,
        difficultySet: !!diffRaw,
        spreadSet: spread !== null,
        modules: [],
      };
      topicByCode.set(topicCode, topic);
      draft.topics.push(topic);
    } else {
      if (topic.name !== topicName) err(row, `Topic ${topicCode} is named "${topicName}" here but "${topic.name}" on row ${topic.row}.`);
      if (topic.weightMin !== wMin.value || topic.weightMax !== wMax.value) {
        err(row, `Topic ${topicCode} has weights ${wMin.value}–${wMax.value} here but ${topic.weightMin}–${topic.weightMax} on row ${topic.row}.`);
      }
      if (diffRaw) {
        if (topic.difficultySet && topic.difficulty !== diff.value) err(row, `Topic ${topicCode} has topic_difficulty ${diff.value} here but ${topic.difficulty} earlier.`);
        topic.difficulty = diff.value;
        topic.difficultySet = true;
      }
      if (spread !== null) {
        if (topic.spreadSet && topic.spread !== spread) err(row, `Topic ${topicCode} has topic_spread ${spread} here but ${topic.spread} earlier.`);
        topic.spread = spread;
        topic.spreadSet = true;
      }
    }

    const key = `${topicCode}\u0000${moduleTitle.toLowerCase()}`;
    let mod = moduleByKey.get(key);
    if (!mod) {
      mod = { row, title: moduleTitle, estMinutes: est.value, los: [] };
      moduleByKey.set(key, mod);
      topic.modules.push(mod);
    } else {
      const last = topic.modules[topic.modules.length - 1];
      if (last !== mod) warn(row, `Module "${moduleTitle}" continues after other modules; its objectives are grouped together under row ${mod.row}.`);
      if (estRaw && mod.estMinutes !== est.value) {
        warn(row, `Module "${moduleTitle}" has est_minutes ${est.value} here but ${mod.estMinutes} on row ${mod.row}; keeping ${mod.estMinutes}.`);
      }
    }
    mod.los.push({ code: losCode, commandWord: command, text: losText, importance: imp.value });
  });

  if (dataRows === 0) err(0, "The file has a header but no objectives.");

  // Whole-file checks.
  if (draft.topics.length > 0 && errors.length === 0) {
    const sumMin = draft.topics.reduce((s, t) => s + t.weightMin, 0);
    const sumMax = draft.topics.reduce((s, t) => s + t.weightMax, 0);
    if (sumMin > 100) warn(0, `Topic minimum weights add up to ${sumMin}%, which is more than 100%.`);
    if (sumMax < 100) warn(0, `Topic maximum weights add up to ${sumMax}%, which is less than 100%.`);
  }

  // Rebuild without the accumulator fields so the draft is a clean CurriculumDraft.
  draft.topics = (draft.topics as TopicAcc[]).map((t) => ({
    code: t.code,
    name: t.name,
    weightMin: t.weightMin,
    weightMax: t.weightMax,
    difficulty: t.difficulty,
    spread: t.spread,
    modules: t.modules.map((m) => ({ title: m.title, estMinutes: m.estMinutes, los: m.los })),
  }));
  errors.sort((a, b) => a.row - b.row);
  warnings.sort((a, b) => a.row - b.row);
  return { draft, errors, warnings };
}

export type DraftStats = { topics: number; modules: number; los: number };
export function draftStats(d: CurriculumShape): DraftStats {
  let modules = 0;
  let los = 0;
  for (const t of d.topics) {
    modules += t.modules.length;
    for (const m of t.modules) los += m.los.length;
  }
  return { topics: d.topics.length, modules, los };
}

/** Write a curriculum back out in the import format (round-trips with the parser). */
export function curriculumToCsv(d: CurriculumShape): string {
  const lines = [[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(",")];
  for (const t of d.topics)
    for (const m of t.modules)
      for (const l of m.los)
        lines.push(
          [
            t.code,
            t.name,
            t.weightMin,
            t.weightMax,
            m.title,
            m.estMinutes ?? DEFAULT_EST_MINUTES,
            l.code,
            l.commandWord,
            l.text,
            l.importance ?? DEFAULT_IMPORTANCE,
            t.difficulty ?? DEFAULT_TOPIC_DIFFICULTY,
            t.spread ?? false,
          ]
            .map(csvCell)
            .join(","),
        );
  return lines.join("\r\n") + "\r\n";
}

/** A small, clearly-fake example in the import format. */
export const CSV_TEMPLATE = curriculumToCsv({
  topics: [
    {
      code: "ETH",
      name: "Ethical and Professional Standards",
      weightMin: 15,
      weightMax: 20,
      difficulty: 2,
      spread: true,
      modules: [
        {
          title: "Example module title",
          estMinutes: 180,
          los: [
            { code: "ETH.1.a", commandWord: "describe", text: "Describe … (paste the official objective text, if licensing allows, or a short paraphrase)", importance: 2 },
            { code: "ETH.1.b", commandWord: "explain", text: "Explain …, including \"quoted\" words and commas", importance: 3 },
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
          title: "Another module",
          estMinutes: 240,
          los: [{ code: "QM.1.a", commandWord: "calculate", text: "Calculate …", importance: 2 }],
        },
      ],
    },
  ],
});

// ------------------------------------------------------------------ diff

/** The minimum a curriculum needs for diffing and CSV export (DB rows or a draft). */
export type CurriculumShape = {
  topics: {
    code: string;
    name: string;
    weightMin: number;
    weightMax: number;
    difficulty?: number;
    spread?: boolean;
    modules: {
      title: string;
      estMinutes?: number;
      los: { code: string; commandWord: string; text: string; importance?: number }[];
    }[];
  }[];
};

export type LosRef = { code: string; text: string; topicCode: string; moduleTitle: string };
export type CurriculumDiff = {
  addedLos: LosRef[];
  removedLos: LosRef[];
  rewordedLos: { code: string; topicCode: string; oldText: string; newText: string; oldCommandWord: string; newCommandWord: string }[];
  movedLos: { code: string; from: string; to: string }[];
  addedTopics: { code: string; name: string; weightMin: number; weightMax: number }[];
  removedTopics: { code: string; name: string }[];
  topicChanges: {
    code: string;
    oldName: string;
    newName: string;
    oldWeight: [number, number];
    newWeight: [number, number];
  }[];
  unchangedLos: number;
};

const losKey = (code: string) => code.toLowerCase();

function flatten(c: CurriculumShape) {
  const out = new Map<string, LosRef & { commandWord: string }>();
  for (const t of c.topics)
    for (const m of t.modules)
      for (const l of m.los) out.set(losKey(l.code), { code: l.code, text: l.text, commandWord: l.commandWord, topicCode: t.code, moduleTitle: m.title });
  return out;
}

/** What changes between two curricula, matching objectives by code (case-insensitive) and topics by code. */
export function diffCurricula(oldC: CurriculumShape, newC: CurriculumShape): CurriculumDiff {
  const a = flatten(oldC);
  const b = flatten(newC);
  const diff: CurriculumDiff = {
    addedLos: [],
    removedLos: [],
    rewordedLos: [],
    movedLos: [],
    addedTopics: [],
    removedTopics: [],
    topicChanges: [],
    unchangedLos: 0,
  };
  const strip = ({ code, text, topicCode, moduleTitle }: LosRef) => ({ code, text, topicCode, moduleTitle });
  for (const [k, n] of b) {
    const o = a.get(k);
    if (!o) {
      diff.addedLos.push(strip(n));
      continue;
    }
    let changed = false;
    if (collapse(o.text) !== collapse(n.text) || o.commandWord.toLowerCase() !== n.commandWord.toLowerCase()) {
      diff.rewordedLos.push({ code: n.code, topicCode: n.topicCode, oldText: o.text, newText: n.text, oldCommandWord: o.commandWord, newCommandWord: n.commandWord });
      changed = true;
    }
    const from = `${o.topicCode} / ${o.moduleTitle}`;
    const to = `${n.topicCode} / ${n.moduleTitle}`;
    if (o.topicCode.toLowerCase() !== n.topicCode.toLowerCase() || collapse(o.moduleTitle).toLowerCase() !== collapse(n.moduleTitle).toLowerCase()) {
      diff.movedLos.push({ code: n.code, from, to });
      changed = true;
    }
    if (!changed) diff.unchangedLos++;
  }
  for (const [k, o] of a) if (!b.has(k)) diff.removedLos.push(strip(o));

  const oldTopics = new Map(oldC.topics.map((t) => [t.code.toLowerCase(), t]));
  const newTopics = new Map(newC.topics.map((t) => [t.code.toLowerCase(), t]));
  for (const [k, t] of newTopics) {
    const o = oldTopics.get(k);
    if (!o) {
      diff.addedTopics.push({ code: t.code, name: t.name, weightMin: t.weightMin, weightMax: t.weightMax });
    } else if (o.name !== t.name || o.weightMin !== t.weightMin || o.weightMax !== t.weightMax) {
      diff.topicChanges.push({ code: t.code, oldName: o.name, newName: t.name, oldWeight: [o.weightMin, o.weightMax], newWeight: [t.weightMin, t.weightMax] });
    }
  }
  for (const [k, o] of oldTopics) if (!newTopics.has(k)) diff.removedTopics.push({ code: o.code, name: o.name });
  return diff;
}

export function diffIsEmpty(d: CurriculumDiff): boolean {
  return (
    d.addedLos.length + d.removedLos.length + d.rewordedLos.length + d.movedLos.length + d.addedTopics.length + d.removedTopics.length + d.topicChanges.length ===
    0
  );
}
