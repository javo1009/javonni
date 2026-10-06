// Pure logic for practice sessions: timing, keyboard shortcuts, and the end-of-session summary.

export const TIMED_SECONDS_PER_QUESTION = 90;

/** 83_000 -> "1:23" (never negative). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Milliseconds left for a question that started at `startedAt`. */
export const remainingMs = (
  startedAt: number,
  now: number,
  limitMs = TIMED_SECONDS_PER_QUESTION * 1000,
) => Math.max(0, limitMs - (now - startedAt));

/** Elapsed time for the attempt record, clamped to what the server accepts (0 to 1 hour). */
export const elapsedMs = (startedAt: number, now: number) =>
  Math.min(3_600_000, Math.max(0, Math.round(now - startedAt)));

/**
 * Which option a key press chooses: 1-4 pick by position, A-D (any case) by option key.
 * Returns null for any other key, modifier combos, or an out-of-range number.
 */
export function optionForKey(
  key: string,
  optionKeys: string[],
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
): string | null {
  if (mods.ctrl || mods.meta || mods.alt) return null;
  if (/^[1-9]$/.test(key)) return optionKeys[Number(key) - 1] ?? null;
  if (key.length === 1) {
    const hit = optionKeys.find((k) => k.toLowerCase() === key.toLowerCase());
    return hit ?? null;
  }
  return null;
}

export type QuestionOutcome = {
  questionId: string;
  moduleId: string;
  moduleTitle: string;
  /** "correct" / "wrong" were answered; "skipped" includes timed-out questions. */
  result: "correct" | "wrong" | "skipped";
};

export type ModuleSummary = {
  moduleId: string;
  title: string;
  answered: number;
  correct: number;
  pct: number;
};

export type SessionSummary = {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  /** Percent correct of answered questions, or null if none were answered. */
  pct: number | null;
  byModule: ModuleSummary[];
  /** Lowest-scoring chapter with at least one answer (ties: more wrong answers, then title). Null if everything was right or nothing answered. */
  weakest: ModuleSummary | null;
};

export function summarize(outcomes: QuestionOutcome[]): SessionSummary {
  const mods = new Map<string, ModuleSummary>();
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  for (const o of outcomes) {
    if (o.result === "skipped") {
      skipped++;
      continue;
    }
    const m = mods.get(o.moduleId) ?? {
      moduleId: o.moduleId,
      title: o.moduleTitle,
      answered: 0,
      correct: 0,
      pct: 0,
    };
    m.answered++;
    if (o.result === "correct") {
      m.correct++;
      correct++;
    } else wrong++;
    mods.set(o.moduleId, m);
  }
  const byModule = [...mods.values()]
    .map((m) => ({ ...m, pct: Math.round((m.correct / m.answered) * 100) }))
    .sort(
      (a, b) =>
        a.pct - b.pct ||
        b.answered - b.correct - (a.answered - a.correct) ||
        a.title.localeCompare(b.title),
    );
  const answered = correct + wrong;
  const weakest = byModule.find((m) => m.correct < m.answered) ?? null;
  return {
    total: outcomes.length,
    answered,
    correct,
    wrong,
    skipped,
    pct: answered ? Math.round((correct / answered) * 100) : null,
    byModule,
    weakest,
  };
}

/** "75% (9 of 12)" for a chapter tally; null when there is nothing yet. */
export function tallyText(
  t: { attempts: number; correct: number } | null,
): string | null {
  if (!t || t.attempts === 0) return null;
  return `${t.correct} of ${t.attempts} correct (${Math.round((t.correct / t.attempts) * 100)}%)`;
}
