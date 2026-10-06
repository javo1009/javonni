// Focus timer state machine. Pure: callers pass `now` (ms since epoch) and persist the state themselves
// (the browser keeps it in localStorage so a running timer survives navigation and reloads).

export const TIMER_KEY = "ascent:focus-timer:v1";
/** Sessions shorter than this can't be logged (same rule as the manual form and the server). */
export const TIMER_MIN_MINUTES = 15;
export const TIMER_MAX_MINUTES = 24 * 60;

export type TimerState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; accumulatedMs: number }
  | { status: "paused"; accumulatedMs: number };

export const IDLE: TimerState = { status: "idle" };

export function timerElapsed(s: TimerState, now: number): number {
  if (s.status === "idle") return 0;
  if (s.status === "paused") return s.accumulatedMs;
  return s.accumulatedMs + Math.max(0, now - s.startedAt);
}

export function timerStart(s: TimerState, now: number): TimerState {
  if (s.status === "running") return s;
  return {
    status: "running",
    startedAt: now,
    accumulatedMs: s.status === "paused" ? s.accumulatedMs : 0,
  };
}

export function timerPause(s: TimerState, now: number): TimerState {
  if (s.status !== "running") return s;
  return { status: "paused", accumulatedMs: timerElapsed(s, now) };
}

/** Whole minutes to offer for logging, capped at a day, and whether they meet the 15 minute minimum. */
export function loggable(elapsedMs: number): {
  minutes: number;
  enough: boolean;
} {
  const minutes = Math.min(
    TIMER_MAX_MINUTES,
    Math.round(Math.max(0, elapsedMs) / 60_000),
  );
  return { minutes, enough: minutes >= TIMER_MIN_MINUTES };
}

/** Minutes still needed to reach the minimum (0 when there is enough). */
export const minutesToMinimum = (elapsedMs: number) =>
  Math.max(0, TIMER_MIN_MINUTES - Math.floor(Math.max(0, elapsedMs) / 60_000));

/** "1:05:09" for an hour or more, otherwise "05:09". */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

const finiteNonNegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Read a stored timer defensively: anything malformed is treated as no timer. */
export function parseTimerState(raw: string | null): TimerState {
  if (!raw) return IDLE;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return IDLE;
    if (
      v.status === "running" &&
      finiteNonNegative(v.startedAt) &&
      finiteNonNegative(v.accumulatedMs)
    )
      return {
        status: "running",
        startedAt: v.startedAt,
        accumulatedMs: v.accumulatedMs,
      };
    if (v.status === "paused" && finiteNonNegative(v.accumulatedMs))
      return { status: "paused", accumulatedMs: v.accumulatedMs };
  } catch {
    // fall through
  }
  return IDLE;
}

export const serializeTimerState = (s: TimerState) => JSON.stringify(s);
