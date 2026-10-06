import { describe, expect, it } from "vitest";
import { IDLE, TIMER_MIN_MINUTES, formatClock, loggable, minutesToMinimum, parseTimerState, serializeTimerState, timerElapsed, timerPause, timerStart } from "../focus-timer";

const MIN = 60_000;

describe("focus timer", () => {
  it("accumulates across start, pause and resume", () => {
    let s = timerStart(IDLE, 1_000);
    expect(timerElapsed(s, 1_000 + 10 * MIN)).toBe(10 * MIN);
    s = timerPause(s, 1_000 + 10 * MIN);
    expect(s).toEqual({ status: "paused", accumulatedMs: 10 * MIN });
    // Time passing while paused doesn't count.
    expect(timerElapsed(s, 1_000 + 90 * MIN)).toBe(10 * MIN);
    s = timerStart(s, 100 * MIN);
    expect(timerElapsed(s, 105 * MIN)).toBe(15 * MIN);
  });

  it("starting a running timer or pausing an idle one changes nothing", () => {
    const running = timerStart(IDLE, 5);
    expect(timerStart(running, 99)).toBe(running);
    expect(timerPause(IDLE, 99)).toBe(IDLE);
  });

  it("never reports negative time if the clock moves backwards", () => {
    expect(timerElapsed({ status: "running", startedAt: 500, accumulatedMs: 0 }, 100)).toBe(0);
  });

  it("applies the 15 minute minimum when logging", () => {
    expect(loggable(14 * MIN + 29_000)).toEqual({ minutes: 14, enough: false });
    expect(loggable(14 * MIN + 31_000)).toEqual({ minutes: 15, enough: true });
    expect(loggable(26 * 60 * MIN).minutes).toBe(24 * 60);
    expect(minutesToMinimum(4 * MIN)).toBe(TIMER_MIN_MINUTES - 4);
    expect(minutesToMinimum(40 * MIN)).toBe(0);
  });

  it("formats a clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });

  it("round-trips stored state and rejects garbage", () => {
    const s = { status: "running" as const, startedAt: 123, accumulatedMs: 456 };
    expect(parseTimerState(serializeTimerState(s))).toEqual(s);
    expect(parseTimerState(serializeTimerState({ status: "paused", accumulatedMs: 9 }))).toEqual({ status: "paused", accumulatedMs: 9 });
    for (const bad of [null, "", "nope", "null", "{}", '{"status":"running"}', '{"status":"paused","accumulatedMs":-1}', '{"status":"running","startedAt":"x","accumulatedMs":0}'])
      expect(parseTimerState(bad)).toBe(IDLE);
  });
});
