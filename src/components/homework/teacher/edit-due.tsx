"use client";

import { useState, useTransition } from "react";
import { updateHomework } from "@/app/actions/teacher";
import { Button, Input } from "@/components/ui";

/** Local `YYYY-MM-DDTHH:mm` for a datetime-local input, in the browser's time zone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Move the due date (drafts and assigned homework). The time is read in the teacher's device time zone. */
export function EditDue({
  assignmentId,
  dueAtIso,
}: {
  assignmentId: string;
  dueAtIso: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setValue(toLocalInput(dueAtIso));
          setOpen(true);
        }}
      >
        Change due date
      </Button>
    );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="text-sm font-medium text-ink">
        New due date and time
        <Input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full sm:w-64"
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || !value}
          onClick={() => {
            setError(null);
            const when = new Date(value);
            if (Number.isNaN(when.getTime()))
              return setError("Enter a valid date and time.");
            start(async () => {
              const r = await updateHomework(assignmentId, {
                dueAt: when.toISOString(),
              });
              if (r.ok) setOpen(false);
              else setError(r.error);
            });
          }}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
        >
          {error}
        </p>
      )}
    </div>
  );
}
