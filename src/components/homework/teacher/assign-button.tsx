"use client";

import { useState, useTransition } from "react";
import { publishHomework } from "@/app/actions/teacher";
import { Button } from "@/components/ui";
import { Spinner } from "./file-drop";

/** Assigns a draft to its students (needs a future due date). Shows the service's message if it can't. */
export function AssignButton({ assignmentId, disabledReason }: { assignmentId: string; disabledReason?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button
        type="button"
        disabled={pending || !!disabledReason}
        aria-busy={pending}
        aria-describedby={disabledReason ? "assign-reason" : undefined}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await publishHomework(assignmentId);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        {pending ? (
          <>
            <Spinner className="border-brand-ink border-t-transparent" /> Assigning…
          </>
        ) : (
          "Assign to students"
        )}
      </Button>
      {disabledReason && (
        <p id="assign-reason" className="max-w-64 text-xs text-ink-2 sm:text-right">
          {disabledReason}
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-72 rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
          {error}
        </p>
      )}
    </div>
  );
}
