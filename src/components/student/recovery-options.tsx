"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { replanAction } from "@/app/actions/student";
import { buttonClass } from "@/components/ui";
import type { RecoveryOption } from "@/domain/assessment";
import { cn } from "@/lib/cn";

type Choice = { kind: "add_time"; extraMinutesPerWeek: number } | { kind: "drop_optional" } | { kind: "as_is" };

type Option = { id: string; title: string; summary: string; choice: Choice | null };

function toOptions(options: RecoveryOption[]): Option[] {
  const out: Option[] = [];
  for (const o of options) {
    if (o.kind === "add_time")
      out.push({ id: "add_time", title: "Add a little time each week", summary: o.summary, choice: { kind: "add_time", extraMinutesPerWeek: o.extraMinutesPerWeek } });
    if (o.kind === "drop_optional") out.push({ id: "drop_optional", title: "Trim optional review", summary: o.summary, choice: { kind: "drop_optional" } });
  }
  out.push({
    id: "as_is",
    title: "Reschedule what's left",
    summary: "Keep your weekly hours and spread the missed work over the coming weeks. Later weeks get fuller and some practice may be squeezed.",
    choice: { kind: "as_is" },
  });
  const talk = options.find((o) => o.kind === "review_exam_date");
  if (talk) out.push({ id: "review_exam_date", title: "Consider a later exam window", summary: talk.summary, choice: null });
  return out;
}

/** Catch-up options. Nothing changes until the student picks one and confirms. */
export function RecoveryOptions({ options }: { options: RecoveryOption[] }) {
  const opts = toOptions(options);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chosen = opts.find((o) => o.id === selected);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="sr-only">Choose how to catch up</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {opts.map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex min-h-11 cursor-pointer gap-3 rounded-lg border bg-surface p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                selected === o.id ? "border-brand bg-brand-soft" : "border-border-strong hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="recovery"
                value={o.id}
                checked={selected === o.id}
                onChange={() => {
                  setSelected(o.id);
                  setError(null);
                }}
                className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="mt-0.5 block text-sm text-ink-2">{o.summary}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {chosen && chosen.choice === null && (
        <p className="text-sm text-ink-2">
          This one is a conversation, not a button. If you decide to move, <Link href="/student/onboarding" className="font-medium text-brand hover:underline">rebuild the plan</Link> with the new date.
        </p>
      )}
      {chosen?.choice && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                // Navigates to the rebuilt plan on success.
                const r = await replanAction(chosen.choice!);
                if (!r.ok) setError(r.error);
              })
            }
            className={buttonClass("primary", "md", "max-sm:min-h-11")}
          >
            {pending ? "Rebuilding…" : "Rebuild my plan with this"}
          </button>
          <button type="button" onClick={() => setSelected(null)} disabled={pending} className={buttonClass("ghost", "md", "max-sm:min-h-11")}>
            Not now
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-risk">
          {error}
        </p>
      )}
    </div>
  );
}
