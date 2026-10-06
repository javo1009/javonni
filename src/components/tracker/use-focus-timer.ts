"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  IDLE,
  TIMER_KEY,
  parseTimerState,
  serializeTimerState,
  timerElapsed,
  timerPause,
  timerStart,
  type TimerState,
} from "@/lib/focus-timer";

// The timer lives in localStorage so it survives navigation, reloads and other tabs.
// If storage is blocked we fall back to memory for this page load.
const listeners = new Set<() => void>();
let memory: string | null = null;
let lastRaw: string | null | undefined;
let lastState: TimerState = IDLE;

function readRaw(): string | null {
  try {
    return localStorage.getItem(TIMER_KEY);
  } catch {
    return memory;
  }
}

function getSnapshot(): TimerState {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastState = parseTimerState(raw);
  }
  return lastState;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TIMER_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function write(state: TimerState) {
  const raw = state.status === "idle" ? null : serializeTimerState(state);
  memory = raw;
  try {
    if (raw === null) localStorage.removeItem(TIMER_KEY);
    else localStorage.setItem(TIMER_KEY, raw);
  } catch {
    // memory fallback only
  }
  listeners.forEach((l) => l());
}

const noop = () => () => {};

/** Current time, refreshed every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

export function useFocusTimer() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const now = useNow(state.status === "running");
  // `now` is 0 until the first tick; the elapsed time then falls back to the stored accumulation.
  const elapsedMs = timerElapsed(
    state,
    state.status === "running" ? Math.max(now, state.startedAt) : 0,
  );

  const start = useCallback(
    () => write(timerStart(getSnapshot(), Date.now())),
    [],
  );
  const pause = useCallback(
    () => write(timerPause(getSnapshot(), Date.now())),
    [],
  );
  const reset = useCallback(() => write(IDLE), []);
  return { state, mounted, elapsedMs, start, pause, reset };
}
