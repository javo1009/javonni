"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { addStudySession } from "@/app/actions/student";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import {
  NOTE_MAX,
  SESSION_MIN_MINUTES,
  toMinutes,
  validateSession,
} from "@/lib/tracker-view";
import { StatusMessage, useNotice } from "./messages";
import { Panel } from "./panel";

const PRESETS = [30, 60, 90, 120];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-risk">
      {message}
    </p>
  );
}

/** Manual study-session log: date, duration (hours + minutes, at least 15), topic and an optional note. */
export function SessionForm({
  topics,
  defaultTopic,
  today,
}: {
  topics: string[];
  defaultTopic: string;
  today: string;
}) {
  const uid = useId();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("1");
  const [mins, setMins] = useState("0");
  const [topic, setTopic] = useState(defaultTopic);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const [notice, notify] = useNotice();
  const total = toMinutes(hours, mins);

  function submit(e: FormEvent) {
    e.preventDefault();
    notify(null);
    const found = validateSession(
      { date, minutes: total, topic, note },
      today,
      topics,
    );
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const r = await addStudySession({
        date,
        minutes: total,
        topic,
        note: note.trim() || undefined,
        source: "manual",
      });
      if (!r.ok) return setErrors({ form: r.error });
      setNote("");
      notify(`Saved ${formatMinutes(total)} of ${topic}.`);
    });
  }

  function preset(m: number) {
    setHours(String(Math.floor(m / 60)));
    setMins(String(m % 60));
  }

  return (
    <Panel
      id="session-form-title"
      title="Add a study session"
      eyebrow="LOG TIME"
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-date`}
            className="block text-sm font-medium text-ink"
          >
            Date
          </label>
          <Input
            id={`${uid}-date`}
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${uid}-date-e` : undefined}
          />
          <FieldError id={`${uid}-date-e`} message={errors.date} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">Time studied</legend>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-sm text-ink-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={24}
                step={1}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                aria-label="Hours"
                aria-invalid={!!errors.duration}
                aria-describedby={errors.duration ? `${uid}-dur-e` : undefined}
              />
              h
            </label>
            <label className="flex flex-1 items-center gap-2 text-sm text-ink-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={5}
                value={mins}
                onChange={(e) => setMins(e.target.value)}
                aria-label="Minutes"
                aria-invalid={!!errors.duration}
              />
              min
            </label>
          </div>
          <div
            className="flex flex-wrap gap-1.5 pt-1"
            role="group"
            aria-label="Quick durations"
          >
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => preset(m)}
                className={cn(
                  "min-h-8 rounded-full border px-3 text-xs font-semibold max-sm:min-h-11",
                  total === m
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border-strong bg-surface-2 text-ink-2 hover:text-ink",
                )}
              >
                {formatMinutes(m)}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-3">
            At least {SESSION_MIN_MINUTES} minutes per session.
            {Number.isFinite(total) && total > 0
              ? ` Logging ${formatMinutes(total)}.`
              : ""}
          </p>
          <FieldError id={`${uid}-dur-e`} message={errors.duration} />
        </fieldset>
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-topic`}
            className="block text-sm font-medium text-ink"
          >
            Topic
          </label>
          <Select
            id={`${uid}-topic`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            aria-invalid={!!errors.topic}
          >
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <FieldError id={`${uid}-topic-e`} message={errors.topic} />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-note`}
            className="block text-sm font-medium text-ink"
          >
            Note (optional)
          </label>
          <Textarea
            id={`${uid}-note`}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you cover?"
          />
          <p className="text-right text-xs text-ink-3">
            {note.length}/{NOTE_MAX}
          </p>
          <FieldError id={`${uid}-note-e`} message={errors.note} />
        </div>
        {errors.form && (
          <p
            role="alert"
            className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
          >
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full"
        >
          {pending ? "Saving…" : "Save session"}
        </Button>
        <StatusMessage notice={notice} />
      </form>
    </Panel>
  );
}
