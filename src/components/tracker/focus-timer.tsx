"use client";

import { useId, useState, useTransition } from "react";
import { Pause, Play, Square } from "lucide-react";
import { addStudySession } from "@/app/actions/student";
import { Button, FormError, Input, ProgressBar, Select, Textarea } from "@/components/ui";
import { TIMER_MIN_MINUTES, formatClock, loggable, minutesToMinimum } from "@/lib/focus-timer";
import { formatMinutes } from "@/lib/format";
import { NOTE_MAX, SESSION_MAX_MINUTES, validateSession } from "@/lib/tracker-view";
import { StatusMessage, useNotice } from "./messages";
import { Panel } from "./panel";
import { useFocusTimer } from "./use-focus-timer";

/**
 * Start / pause / stop timer that logs the session with source "timer".
 * State lives in localStorage (see use-focus-timer), so it keeps running while you browse the tracker.
 */
export function FocusTimer({ topics, defaultTopic, today }: { topics: string[]; defaultTopic: string; today: string }) {
  const { state, mounted, elapsedMs, start, pause, reset } = useFocusTimer();
  const [finishing, setFinishing] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [topic, setTopic] = useState(defaultTopic);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, notify] = useNotice();
  const uid = useId();

  const running = state.status === "running";
  const idle = state.status === "idle";
  const { minutes: elapsedMinutes, enough } = loggable(elapsedMs);

  function stop() {
    pause();
    setMinutes(String(loggable(elapsedMs).minutes));
    setError(null);
    notify(null);
    setFinishing(true);
  }

  function keepGoing() {
    setFinishing(false);
    start();
  }

  function discard() {
    reset();
    setFinishing(false);
    setError(null);
    notify("Timer discarded.");
  }

  function save() {
    const m = Number(minutes);
    const found = validateSession({ date: today, minutes: m, topic, note }, today, topics);
    const first = found.duration ?? found.topic ?? found.note;
    if (first) return setError(first);
    setError(null);
    startTransition(async () => {
      const r = await addStudySession({ date: today, minutes: m, topic, note: note.trim() || undefined, source: "timer" });
      if (!r.ok) return setError(r.error);
      reset();
      setFinishing(false);
      setNote("");
      notify(`Logged ${formatMinutes(m)} of ${topic}.`);
    });
  }

  return (
    <Panel id="timer-title" eyebrow="FOCUS TIMER" title="Study with a timer">
      {!mounted ? (
        <div className="h-24" aria-hidden />
      ) : finishing ? (
        <div className="space-y-4">
          <p className="tabular text-4xl font-bold tracking-[-0.04em] text-ink" aria-label={`Elapsed ${formatClock(elapsedMs)}`}>
            {formatClock(elapsedMs)}
          </p>
          {!enough && (
            <p role="alert" className="rounded-[9px] bg-warn-soft px-3.5 py-3 text-sm text-warn">
              That&apos;s only {elapsedMinutes} {elapsedMinutes === 1 ? "minute" : "minutes"}. Sessions under {TIMER_MIN_MINUTES} minutes can&apos;t be logged, so keep going for {minutesToMinimum(elapsedMs)} more or discard this one.
            </p>
          )}
          {enough && <p className="text-sm text-ink-2">Check the details, then save. You can adjust the minutes if you forgot to pause.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-min`} className="block text-sm font-medium text-ink">
                Minutes to log
              </label>
              <Input id={`${uid}-min`} type="number" inputMode="numeric" min={TIMER_MIN_MINUTES} max={SESSION_MAX_MINUTES} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-topic`} className="block text-sm font-medium text-ink">
                Topic
              </label>
              <Select id={`${uid}-topic`} value={topic} onChange={(e) => setTopic(e.target.value)}>
                {topics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-ink">
              Note (optional)
            </label>
            <Textarea id={`${uid}-note`} rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you cover?" className="min-h-16" />
          </div>
          <FormError message={error ?? undefined} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || Number(minutes) < TIMER_MIN_MINUTES} aria-busy={pending}>
              {pending ? "Saving…" : "Save session"}
            </Button>
            <Button variant="secondary" onClick={keepGoing} disabled={pending}>
              <Play aria-hidden className="size-4" />
              Keep going
            </Button>
            <Button variant="ghost" onClick={discard} disabled={pending}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p role="timer" aria-live="off" aria-label={`Elapsed time ${formatClock(elapsedMs)}`} className="tabular text-5xl font-bold tracking-[-0.04em] text-ink max-sm:text-4xl">
              {formatClock(elapsedMs)}
            </p>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <Button variant="secondary" onClick={pause}>
                  <Pause aria-hidden className="size-4" />
                  Pause
                </Button>
              ) : (
                <Button onClick={start}>
                  <Play aria-hidden className="size-4" />
                  {idle ? "Start timer" : "Resume"}
                </Button>
              )}
              {!idle && (
                <Button variant="secondary" onClick={stop}>
                  <Square aria-hidden className="size-4" />
                  Stop and log
                </Button>
              )}
            </div>
          </div>
          <p className="sr-only" role="status">
            {running ? "Timer running" : state.status === "paused" ? "Timer paused" : "Timer stopped"}
          </p>
          {!idle && (
            <div className="mt-4">
              <ProgressBar value={Math.min(elapsedMs, TIMER_MIN_MINUTES * 60_000)} max={TIMER_MIN_MINUTES * 60_000} label={`Progress to the ${TIMER_MIN_MINUTES} minute minimum`} />
              <p className="mt-1.5 text-sm text-ink-2">
                {enough ? `Long enough to log: ${formatMinutes(elapsedMinutes)} so far.` : `${minutesToMinimum(elapsedMs)} more minutes until this can be logged.`}
              </p>
            </div>
          )}
          <p className="mt-4 text-sm text-ink-2">
            Sessions shorter than {TIMER_MIN_MINUTES} minutes can&apos;t be logged, the same rule as the form below. The timer keeps running if you move around the tracker or close this tab, and logs to today ({today}) when you stop.
          </p>
        </div>
      )}
      <StatusMessage notice={notice} className="mt-3" />
    </Panel>
  );
}
