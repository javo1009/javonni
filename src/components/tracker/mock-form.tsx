"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { addMockResult } from "@/app/actions/student";
import { Button, Input, Textarea } from "@/components/ui";
import { NOTE_MAX, validateMock } from "@/lib/tracker-view";
import { StatusMessage, useNotice } from "./messages";
import { Panel } from "./panel";

export function MockForm({ today }: { today: string }) {
  const uid = useId();
  const [date, setDate] = useState(today);
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const [notice, notify] = useNotice();

  function submit(e: FormEvent) {
    e.preventDefault();
    notify(null);
    const found = validateMock({ date, score, note }, today);
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const r = await addMockResult({
        date,
        score: Number(score),
        note: note.trim() || undefined,
      });
      if (!r.ok) return setErrors({ form: r.error });
      setScore("");
      setNote("");
      notify("Mock result saved.");
    });
  }

  const err = (id: string, m?: string) =>
    m ? (
      <p id={id} role="alert" className="text-sm text-risk">
        {m}
      </p>
    ) : null;

  return (
    <Panel id="mock-form-title" eyebrow="LOG A MOCK" title="Add a mock result">
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
          {err(`${uid}-date-e`, errors.date)}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-score`}
            className="block text-sm font-medium text-ink"
          >
            Score (%)
          </label>
          <Input
            id={`${uid}-score`}
            type="number"
            inputMode="decimal"
            required
            min={0}
            max={100}
            step={0.1}
            placeholder="68"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            aria-invalid={!!errors.score}
            aria-describedby={errors.score ? `${uid}-score-e` : undefined}
          />
          {err(`${uid}-score-e`, errors.score)}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-note`}
            className="block text-sm font-medium text-ink"
          >
            Review note (optional)
          </label>
          <Textarea
            id={`${uid}-note`}
            rows={4}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Which topics cost you marks?"
          />
          {err(`${uid}-note-e`, errors.note)}
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
          {pending ? "Saving…" : "Save mock result"}
        </Button>
        <StatusMessage notice={notice} />
      </form>
    </Panel>
  );
}
