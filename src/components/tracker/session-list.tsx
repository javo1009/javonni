"use client";

import { useOptimistic, useState, useTransition } from "react";
import { removeStudySession } from "@/app/actions/student";
import { Badge, Button, EmptyState } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { formatDay } from "@/lib/tracker-dates";
import type { TrackerSnapshot } from "@/services/tracker";
import { ErrorBanner } from "./messages";

const VISIBLE = 8;
type Session = TrackerSnapshot["sessions"]["recent"][number];

/** Recent sessions, newest first. Delete is two-step (Delete, then Confirm) and disappears from the list instantly. */
export function SessionList({
  sessions,
  count,
  readOnly,
}: {
  sessions: Session[];
  count: number;
  readOnly: boolean;
}) {
  const [list, hide] = useOptimistic(sessions, (cur, id: string) =>
    cur.filter((s) => s.id !== id),
  );
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  function remove(id: string) {
    setConfirming(null);
    setError(null);
    startTransition(async () => {
      hide(id);
      try {
        const r = await removeStudySession(id);
        if (!r.ok) setError(r.error);
      } catch {
        setError(
          "Couldn't delete that session. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {list.length === 0 ? (
        <EmptyState title="No sessions logged yet">
          {readOnly
            ? "Nothing has been logged."
            : "Add your first study block with the form, or start the focus timer."}
        </EmptyState>
      ) : (
        <ul aria-label="Recent study sessions">
          {(all ? list : list.slice(0, VISIBLE)).map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[0.9rem] font-semibold text-ink">
                  <span className="tabular">{formatMinutes(s.minutes)}</span>
                  <span aria-hidden>·</span>
                  <span>{s.topic}</span>
                  {s.source === "timer" && <Badge>Timer</Badge>}
                </p>
                <p className="mt-0.5 break-words text-sm text-ink-2">
                  {s.note || "No note"}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">{formatDay(s.date)}</p>
              </div>
              {!readOnly &&
                (confirming === s.id ? (
                  <span className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(s.id)}
                      aria-label={`Confirm delete ${formatMinutes(s.minutes)} session on ${formatDay(s.date)}`}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(s.id)}
                    aria-label={`Delete ${formatMinutes(s.minutes)} ${s.topic} session on ${formatDay(s.date)}`}
                  >
                    Delete
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {list.length > VISIBLE && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAll((v) => !v)}
          className="mt-2"
          aria-expanded={all}
        >
          {all ? "Show fewer" : `Show all ${list.length} recent sessions`}
        </Button>
      )}
      {count > sessions.length && (
        <p className="mt-2 text-sm text-ink-3">
          Showing the latest {sessions.length} of {count} sessions.
        </p>
      )}
    </div>
  );
}
