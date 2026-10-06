"use client";

import { useOptimistic, useState, useTransition } from "react";
import { removeMockResult } from "@/app/actions/student";
import { Button, EmptyState } from "@/components/ui";
import { formatDayLong } from "@/lib/tracker-dates";
import { fmtHours } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import { ErrorBanner } from "./messages";

type Mock = TrackerSnapshot["mocks"]["items"][number];

/** Mock results, newest first, each with its change from the previous mock. */
export function MockList({ items, readOnly }: { items: Mock[]; readOnly: boolean }) {
  const [list, hide] = useOptimistic(items, (cur, id: string) => cur.filter((m) => m.id !== id));
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    setConfirming(null);
    setError(null);
    startTransition(async () => {
      hide(id);
      try {
        const r = await removeMockResult(id);
        if (!r.ok) setError(r.error);
      } catch {
        setError("Couldn't delete that result. Check your connection and try again.");
      }
    });
  }

  if (list.length === 0) return <EmptyState title="No mock results yet">{readOnly ? "Nothing has been recorded." : "Your scores will appear here once you add one."}</EmptyState>;
  return (
    <div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ul aria-label="Mock exam results">
        {list.map((m, i) => {
          const prev = list[i + 1];
          const delta = prev ? Math.round((m.score - prev.score) * 10) / 10 : null;
          return (
            <li key={m.id} className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold text-ink">
                  <span className="tabular">{fmtHours(m.score)}%</span> · {formatDayLong(m.date)}
                  {delta !== null && (
                    <span className="ml-2 text-xs font-medium text-ink-2">
                      {delta === 0 ? "no change" : `${delta > 0 ? "▲ +" : "▼ "}${fmtHours(delta)} pts`}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 break-words text-sm text-ink-2">{m.note || "No review note"}</p>
              </div>
              {!readOnly &&
                (confirming === m.id ? (
                  <span className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="danger" onClick={() => remove(m.id)} aria-label={`Confirm delete ${fmtHours(m.score)}% mock`}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(m.id)} aria-label={`Delete ${fmtHours(m.score)}% mock from ${formatDayLong(m.date)}`}>
                    Delete
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
