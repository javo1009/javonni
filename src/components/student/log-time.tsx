"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { logStudyTime, type LogTimeState } from "@/app/actions/student";
import { buttonClass, Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

/** "+ Log study time": manual entry for study that wasn't a plan task. */
export function LogTime({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<LogTimeState, FormData>(logStudyTime, undefined);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  const fe = state?.fieldErrors;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="log-time-form"
        onClick={() => setOpen((o) => !o)}
        className={buttonClass("secondary", "md", "max-sm:min-h-11")}
      >
        <Plus className="size-4" aria-hidden /> Log study time
      </button>
      {state?.ok && !open && (
        <p role="status" className="mt-2 text-sm text-good">
          {state.message}
        </p>
      )}
      {open && (
        <form
          id="log-time-form"
          action={action}
          className="mt-3 space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4"
          noValidate
        >
          <FormError message={state?.error} />
          {state?.ok && (
            <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
              {state.message} It counts toward this week.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Date" htmlFor="log-date" errors={fe?.date}>
              <Input id="log-date" name="date" type="date" defaultValue={today} max={today} required className="max-sm:h-11" />
            </Field>
            <Field label="Minutes" htmlFor="log-minutes" errors={fe?.minutes}>
              <Input ref={firstRef} id="log-minutes" name="minutes" type="number" inputMode="numeric" min={5} max={720} step={5} required className="max-sm:h-11" />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="log-note" errors={fe?.note}>
            <Input id="log-note" name="note" maxLength={300} placeholder="e.g. Reread the ethics standards" className="max-sm:h-11" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton pendingLabel="Saving…" className="max-sm:min-h-11">
              Save time
            </SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "md", "max-sm:min-h-11")}>
              Close
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
