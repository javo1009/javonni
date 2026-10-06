// Tracker backup: validates and normalises the JSON exported by the sample Level I dashboard
// ({ version: 1, data: { settings, modules, sessions, mocks } }) so existing progress can be
// brought into the platform. Pure: unknown fields are dropped, bad rows are skipped and counted.

import { isValidDate, type ISODate } from "./dates";

export type BackupModule = { read: boolean; practice: boolean; review: boolean; accuracy: number | null };
export type BackupSession = { date: ISODate; hours: number; topic: string; note: string };
export type BackupMock = { date: ISODate; score: number; note: string };

export type NormalizedBackup = {
  settings: { examDate: ISODate | null; weeklyTargetHours: number | null };
  /** Keyed by module slug, e.g. "quantitative-methods-04". Only slugs in `knownSlugs` are kept. */
  modules: Map<string, BackupModule>;
  sessions: BackupSession[];
  mocks: BackupMock[];
  skipped: { modules: number; sessions: number; mocks: number };
};

export const BACKUP_LIMITS = { fileBytes: 2_000_000, sessions: 2000, mocks: 100, noteChars: 500 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export function normalizeBackup(raw: unknown, knownSlugs: ReadonlySet<string>): NormalizedBackup {
  if (!isObject(raw) || !isObject(raw.data)) throw new BackupError("That file isn't a tracker backup.");
  const data = raw.data;
  if (!isObject(data.modules) || !Array.isArray(data.sessions)) throw new BackupError("That file isn't a tracker backup.");

  const out: NormalizedBackup = {
    settings: { examDate: null, weeklyTargetHours: null },
    modules: new Map(),
    sessions: [],
    mocks: [],
    skipped: { modules: 0, sessions: 0, mocks: 0 },
  };

  if (isObject(data.settings)) {
    const exam = data.settings.examDate;
    if (typeof exam === "string" && isValidDate(exam)) out.settings.examDate = exam;
    const target = Number(data.settings.weeklyTarget);
    if (Number.isFinite(target) && target >= 1 && target <= 80) out.settings.weeklyTargetHours = target;
  }

  for (const [slug, item] of Object.entries(data.modules)) {
    if (!knownSlugs.has(slug) || !isObject(item)) {
      out.skipped.modules++;
      continue;
    }
    const acc = item.accuracy;
    out.modules.set(slug, {
      read: item.read === true,
      practice: item.practice === true,
      review: item.review === true,
      accuracy: acc === "" || acc === null || acc === undefined || !Number.isFinite(Number(acc)) ? null : Math.round(clamp(Number(acc), 0, 100)),
    });
  }

  for (const x of data.sessions.slice(-BACKUP_LIMITS.sessions)) {
    const hours = isObject(x) ? Number(x.hours) : NaN;
    if (!isObject(x) || typeof x.date !== "string" || !isValidDate(x.date) || !(hours > 0 && hours <= 24)) {
      out.skipped.sessions++;
      continue;
    }
    out.sessions.push({
      date: x.date,
      hours,
      topic: String(x.topic ?? "").slice(0, 120),
      note: String(x.note ?? "").slice(0, BACKUP_LIMITS.noteChars),
    });
  }

  if (Array.isArray(data.mocks)) {
    for (const x of data.mocks.slice(-BACKUP_LIMITS.mocks)) {
      const score = isObject(x) ? Number(x.score) : NaN;
      if (!isObject(x) || typeof x.date !== "string" || !isValidDate(x.date) || !(score >= 0 && score <= 100)) {
        out.skipped.mocks++;
        continue;
      }
      out.mocks.push({ date: x.date, score, note: String(x.note ?? "").slice(0, BACKUP_LIMITS.noteChars) });
    }
  }
  return out;
}

/** The export shape, compatible with the sample dashboard's importer. */
export function toBackupJson(input: {
  examDate: ISODate;
  weeklyTargetHours: number;
  modules: Map<string, BackupModule>;
  sessions: BackupSession[];
  mocks: BackupMock[];
  exportedAt: string;
}) {
  return {
    version: 1,
    exportedAt: input.exportedAt,
    data: {
      settings: { examDate: input.examDate, weeklyTarget: input.weeklyTargetHours },
      modules: Object.fromEntries([...input.modules].map(([slug, m]) => [slug, { ...m, accuracy: m.accuracy ?? "" }])),
      sessions: input.sessions.map((s, i) => ({ id: `s${i}`, ...s })),
      mocks: input.mocks.map((m, i) => ({ id: `m${i}`, ...m })),
    },
  };
}
