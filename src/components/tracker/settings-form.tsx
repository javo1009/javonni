"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveSettings } from "@/app/actions/student";
import { Button, Input } from "@/components/ui";
import type { ISODate } from "@/domain/dates";
import {
  EXAM_DATE_MAX,
  EXAM_DATE_MIN,
  fmtHours,
  validateSettings,
} from "@/lib/tracker-view";
import { StatusMessage, useNotice } from "./messages";

/** Exam date and weekly hours. Validated here (same rules as the server) and saved with one button. */
export function SettingsForm({
  examDate,
  weeklyTargetHours,
  today,
}: {
  examDate: ISODate;
  weeklyTargetHours: number;
  today: ISODate;
}) {
  const [date, setDate] = useState<string>(examDate);
  const [hours, setHours] = useState(fmtHours(weeklyTargetHours));
  const [errors, setErrors] = useState<{
    examDate?: string;
    hours?: string;
    server?: string;
  }>({});
  const [pending, startTransition] = useTransition();
  const [notice, notify] = useNotice();
  const dirty = date !== examDate || Number(hours) !== weeklyTargetHours;

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSettings({ examDate: date, hours }, today);
    setErrors(found);
    notify(null);
    if (found.examDate || found.hours) return;
    startTransition(async () => {
      const r = await saveSettings({
        examDate: date,
        weeklyTargetHours: Number(hours),
      });
      if (r.ok) notify("Settings saved. Your plan has been recalculated.");
      else setErrors({ server: r.error });
    });
  }

  const label =
    "text-[0.76rem] font-bold uppercase tracking-[0.08em] text-ink-2";
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Plan settings"
      className="w-full sm:w-auto"
    >
      <div className="flex flex-wrap items-start gap-3 max-sm:[&>div]:flex-1">
        <div className="space-y-1.5">
          <label htmlFor="exam-date" className={label}>
            Exam date
          </label>
          <Input
            id="exam-date"
            type="date"
            min={EXAM_DATE_MIN}
            max={EXAM_DATE_MAX}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.examDate}
            aria-describedby={errors.examDate ? "exam-date-error" : undefined}
            className="w-44 max-sm:w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="weekly-hours" className={label}>
            Hours per week
          </label>
          <Input
            id="weekly-hours"
            type="number"
            inputMode="decimal"
            min={1}
            max={80}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-invalid={!!errors.hours}
            aria-describedby={errors.hours ? "weekly-hours-error" : undefined}
            className="w-32 max-sm:w-full"
          />
        </div>
        <div className="space-y-1.5 max-sm:w-full max-sm:!flex-none">
          <span aria-hidden className={`${label} invisible block`}>
            Save
          </span>
          <Button
            type="submit"
            disabled={!dirty || pending}
            aria-busy={pending}
            className="max-sm:w-full"
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {errors.examDate && (
          <p id="exam-date-error" role="alert" className="text-sm text-risk">
            {errors.examDate}
          </p>
        )}
        {errors.hours && (
          <p id="weekly-hours-error" role="alert" className="text-sm text-risk">
            {errors.hours}
          </p>
        )}
        {errors.server && (
          <p role="alert" className="text-sm text-risk">
            {errors.server}
          </p>
        )}
        <StatusMessage notice={notice} />
      </div>
    </form>
  );
}
