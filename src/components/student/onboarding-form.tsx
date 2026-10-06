"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { CircleCheck, X } from "lucide-react";
import { createPlanAction, type PlanFormState } from "@/app/actions/student";
import { Banner, buttonClass, Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMinutes } from "@/domain/assessment";
import { cn } from "@/lib/cn";
import { dayLabel as formatDay } from "./dates";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PRESETS: { id: string; label: string; hint: string; minutes: number[] }[] = [
  { id: "light", label: "Light", hint: "About 6 h a week", minutes: [45, 45, 45, 45, 0, 90, 90] },
  { id: "steady", label: "Steady", hint: "About 10 h a week", minutes: [60, 60, 60, 60, 60, 150, 150] },
  { id: "intensive", label: "Intensive", hint: "About 15 h a week", minutes: [90, 90, 90, 90, 90, 180, 180] },
  { id: "weekends", label: "Weekends", hint: "About 8 h, Sat and Sun", minutes: [0, 0, 0, 0, 0, 240, 240] },
];

export function OnboardingForm({
  today,
  initial,
  rebuilding,
  intro,
}: {
  today: string;
  initial: { examDate: string; weeklyMinutes: number[]; blackoutDates: string[] };
  rebuilding: boolean;
  /** Server-rendered heading; hidden once the plan is built (the page re-renders as "rebuild"). */
  intro: ReactNode;
}) {
  const [state, action] = useActionState<PlanFormState, FormData>(createPlanAction, undefined);
  const [examDate, setExamDate] = useState(initial.examDate);
  const [weekly, setWeekly] = useState<string[]>(initial.weeklyMinutes.map(String));
  const [blackout, setBlackout] = useState<string[]>(initial.blackoutDates);
  const [newDate, setNewDate] = useState("");

  const total = weekly.reduce((s, v) => s + (Number(v) || 0), 0);
  const activePreset = PRESETS.find((p) => p.minutes.every((m, i) => String(m) === weekly[i]))?.id;
  const fe = state?.fieldErrors;

  if (state?.result) {
    const r = state.result;
    return (
      <div className="space-y-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-ink sm:text-[2.1rem]">You&apos;re all set</h1>
        <div role="status" className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <p className="flex items-center gap-2 text-lg font-semibold text-ink">
            <CircleCheck className="size-5 text-good" aria-hidden /> Your plan is ready
          </p>
          <p className="mt-1 text-ink-2">
            {formatMinutes(r.plannedMinutes)} of study over {r.days} days, sized to the time you said you have.
          </p>
        </div>
        {r.warnings.length > 0 && (
          <Banner tone="warn" title="A few things to know">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {r.warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
          </Banner>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/student" className={buttonClass("primary", "lg")}>
            Go to today
          </Link>
          <Link href="/student/plan" className={buttonClass("secondary", "lg")}>
            See the plan
          </Link>
        </div>
      </div>
    );
  }

  const addBlackout = () => {
    if (!newDate || blackout.includes(newDate)) return;
    setBlackout((b) => [...b, newDate].sort());
    setNewDate("");
  };

  return (
    <>
      {intro}
      <form action={action} className="space-y-8" noValidate>
        <FormError message={state?.error} />

        <section aria-labelledby="exam-h" className="space-y-3">
          <h2 id="exam-h" className="text-lg font-semibold text-ink">
            1. When is your exam?
          </h2>
          <div className="max-w-xs">
            <Field label="Exam date" htmlFor="examDate" hint="Level I runs in February, May, August and November windows." errors={fe?.examDate}>
              <Input
                id="examDate"
                name="examDate"
                type="date"
                min={today}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
                aria-describedby={fe?.examDate ? "examDate-error" : undefined}
                className="max-sm:h-11"
              />
            </Field>
          </div>
        </section>

        <section aria-labelledby="avail-h" className="space-y-3">
          <div>
            <h2 id="avail-h" className="text-lg font-semibold text-ink">
              2. How much time can you study each day?
            </h2>
            <p className="mt-1 text-sm text-ink-2">Be realistic. Ascent keeps a little slack and offers ways to catch up if a week goes badly.</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Start from a preset</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activePreset === p.id}
                  onClick={() => setWeekly(p.minutes.map(String))}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors",
                    activePreset === p.id ? "border-brand bg-brand-soft" : "border-border-strong bg-surface hover:bg-surface-2",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink">{p.label}</span>
                  <span className="block text-xs text-ink-2">{p.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Minutes per day</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {DAYS.map((d, i) => (
                <div key={d} className="rounded-lg border border-border bg-surface p-2.5">
                  <label htmlFor={`day${i}`} className="block text-xs font-medium text-ink-2">
                    {d}
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      id={`day${i}`}
                      name={`day${i}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={720}
                      step={5}
                      value={weekly[i]}
                      onChange={(e) => setWeekly((w) => w.map((v, k) => (k === i ? e.target.value : v)))}
                      className="tabular h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 text-ink sm:h-9"
                    />
                    <span className="text-xs text-ink-2" aria-hidden>
                      min
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {fe?.weeklyMinutes && (
              <p role="alert" className="mt-2 text-sm text-risk">
                {fe.weeklyMinutes.join(" ")}
              </p>
            )}
            <p className="tabular mt-2 text-sm text-ink-2" aria-live="polite">
              Total: <span className="font-semibold text-ink">{formatMinutes(total)}</span> a week
            </p>
          </fieldset>
        </section>

        <section aria-labelledby="off-h" className="space-y-3">
          <div>
            <h2 id="off-h" className="text-lg font-semibold text-ink">
              3. Days off <span className="text-sm font-normal text-ink-2">(optional)</span>
            </h2>
            <p className="mt-1 text-sm text-ink-2">Holidays, travel or busy work days. Nothing will be scheduled on them.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Field label="Add a day off" htmlFor="newBlackout" errors={fe?.blackoutDates}>
                <Input
                  id="newBlackout"
                  type="date"
                  min={today}
                  max={examDate || undefined}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBlackout();
                    }
                  }}
                  className="max-sm:h-11"
                />
              </Field>
            </div>
            <button type="button" onClick={addBlackout} disabled={!newDate} className={buttonClass("secondary", "md", "max-sm:min-h-11")}>
              Add
            </button>
          </div>
          {blackout.length > 0 && (
            <ul aria-label="Days off" className="flex flex-wrap gap-2">
              {blackout.map((d) => (
                <li key={d} className="flex items-center gap-1 rounded-full border border-border-strong bg-surface py-0.5 pl-3 pr-1 text-sm text-ink">
                  {formatDay(d)}
                  <input type="hidden" name="blackout" value={d} />
                  <button
                    type="button"
                    onClick={() => setBlackout((b) => b.filter((x) => x !== d))}
                    aria-label={`Remove ${formatDay(d)}`}
                    className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <SubmitButton size="lg" pendingLabel="Building your plan…">
            {rebuilding ? "Rebuild my plan" : "Build my plan"}
          </SubmitButton>
          {rebuilding && (
            <Link href="/student/plan" className={buttonClass("ghost", "lg")}>
              Cancel
            </Link>
          )}
        </div>
      </form>
    </>
  );
}
