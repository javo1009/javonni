"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createClassAction, updateClassAction } from "@/app/actions/teacher";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FormError,
  Input,
} from "@/components/ui";

type Limits = { minExam: string; maxExam: string };

function parseHours(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

/** Create a class, then open its page. */
export function NewClassForm({
  minExam,
  maxExam,
  title = "New class",
  defaultOpen = true,
}: Limits & { title?: string; defaultOpen?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const hours = parseHours(String(f.get("hours") ?? ""));
    if (hours === null) return setError("Enter weekly hours as a number.");
    setError(undefined);
    start(async () => {
      const r = await createClassAction({
        name: String(f.get("name") ?? ""),
        examDate: String(f.get("examDate") ?? "") || null,
        planStart: String(f.get("planStart") ?? "") || null,
        weeklyTargetHours: hours,
      });
      if (r.ok) router.push(`/teacher/classes/${r.data.id}`);
      else setError(r.error);
    });
  }

  const body = (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Class name" htmlFor={`${uid}-name`}>
            <Input
              id={`${uid}-name`}
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. CFA Level I, February 2027"
              autoComplete="off"
            />
          </Field>
        </div>
        <Field
          label="Exam date"
          htmlFor={`${uid}-exam`}
          hint="Optional. February to December 2027."
        >
          <Input
            id={`${uid}-exam`}
            name="examDate"
            type="date"
            min={minExam}
            max={maxExam}
          />
        </Field>
        <Field
          label="Roadmap start"
          htmlFor={`${uid}-plan`}
          hint="Optional. At least four weeks before the exam."
        >
          <Input
            id={`${uid}-plan`}
            name="planStart"
            type="date"
            max={maxExam}
          />
        </Field>
        <Field
          label="Weekly target hours"
          htmlFor={`${uid}-hours`}
          hint="1 to 80 hours."
        >
          <Input
            id={`${uid}-hours`}
            name="hours"
            type="number"
            inputMode="decimal"
            min={1}
            max={80}
            step={0.5}
            defaultValue={10}
            required
          />
        </Field>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating…" : "Create class"}
      </Button>
    </form>
  );

  if (!defaultOpen) {
    return (
      <details className="group rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-card)] px-5 py-4 text-xl font-semibold tracking-tight text-ink max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
          {title}
          <span
            aria-hidden
            className="text-sm font-semibold text-brand group-open:hidden"
          >
            + Add
          </span>
          <span
            aria-hidden
            className="hidden text-sm font-semibold text-ink-2 group-open:inline"
          >
            Close
          </span>
        </summary>
        <div className="px-5 pb-5">{body}</div>
      </details>
    );
  }
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>{body}</CardBody>
    </Card>
  );
}

/** Class settings. Only changed fields are sent, so renaming a class never trips the exam-date rules. */
export function ClassSettingsForm({
  classId,
  initial,
  studentCount,
  minExam,
  maxExam,
}: Limits & {
  classId: string;
  initial: {
    name: string;
    examDate: string | null;
    planStart: string | null;
    weeklyTargetHours: number;
  };
  studentCount: number;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [apply, setApply] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "");
    const examDate = String(f.get("examDate") ?? "") || null;
    const planStart = String(f.get("planStart") ?? "") || null;
    const hours = parseHours(String(f.get("hours") ?? ""));
    if (hours === null) return setError("Enter weekly hours as a number.");
    const patch: Partial<Parameters<typeof updateClassAction>[1]> = {};
    if (name.trim() !== initial.name) patch.name = name;
    if (examDate !== initial.examDate) patch.examDate = examDate;
    if (planStart !== initial.planStart) patch.planStart = planStart;
    if (hours !== initial.weeklyTargetHours) patch.weeklyTargetHours = hours;
    if (apply) patch.applyToStudents = true;
    if (Object.keys(patch).length === 0)
      return setError("Nothing has changed yet.");
    setError(undefined);
    setSaved(false);
    start(async () => {
      const r = await updateClassAction(
        classId,
        patch as Parameters<typeof updateClassAction>[1],
      );
      if (r.ok) {
        setSaved(true);
        setApply(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  // Remount the uncontrolled inputs when the saved values change so they show what is stored.
  const formKey = `${initial.name}|${initial.examDate}|${initial.planStart}|${initial.weeklyTargetHours}`;
  return (
    <Card aria-labelledby="settings-h">
      <CardHeader
        id="settings-h"
        title="Class settings"
        subtitle="Defaults for this class and the plan new students start on."
      />
      <CardBody>
        <form
          key={formKey}
          onSubmit={submit}
          onChange={() => setSaved(false)}
          className="space-y-4"
          noValidate
        >
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Class name" htmlFor={`${uid}-name`}>
                <Input
                  id={`${uid}-name`}
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={initial.name}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field
              label="Exam date"
              htmlFor={`${uid}-exam`}
              hint="February to December 2027, at least a week away."
            >
              <Input
                id={`${uid}-exam`}
                name="examDate"
                type="date"
                min={minExam}
                max={maxExam}
                defaultValue={initial.examDate ?? ""}
              />
            </Field>
            <Field
              label="Roadmap start"
              htmlFor={`${uid}-plan`}
              hint="At least four weeks before the exam."
            >
              <Input
                id={`${uid}-plan`}
                name="planStart"
                type="date"
                max={maxExam}
                defaultValue={initial.planStart ?? ""}
              />
            </Field>
            <Field
              label="Weekly target hours"
              htmlFor={`${uid}-hours`}
              hint="1 to 80 hours."
            >
              <Input
                id={`${uid}-hours`}
                name="hours"
                type="number"
                inputMode="decimal"
                min={1}
                max={80}
                step={0.5}
                defaultValue={initial.weeklyTargetHours}
                required
              />
            </Field>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <label className="flex cursor-pointer items-start gap-3 max-sm:min-h-11">
              <input
                type="checkbox"
                checked={apply}
                onChange={(e) => setApply(e.target.checked)}
                className="mt-1 size-4 accent-[var(--brand)]"
                disabled={studentCount === 0}
              />
              <span className="text-sm">
                <span className="font-semibold text-ink">
                  Also replace the plan of every enrolled student
                  {studentCount ? ` (${studentCount})` : ""}
                </span>
                <span className="mt-0.5 block text-ink-2">
                  Sets each student&apos;s exam date, roadmap start and weekly
                  target to these values, overwriting anything they changed
                  themselves. Left unticked, the new values only become the
                  starting plan for students who haven&apos;t set one up.
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            <p role="status" className="text-sm font-medium text-good">
              {saved ? "Saved ✓" : ""}
            </p>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
