"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Error shown above a list when an optimistic change was rolled back. */
export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-risk/40 bg-risk-soft px-4 py-3 text-sm text-risk">
      <p>
        <strong className="font-semibold">Not saved.</strong> {message} Your change was undone.
      </p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 font-semibold underline underline-offset-2 max-sm:min-h-11">
          Dismiss
        </button>
      )}
    </div>
  );
}

export type Notice = { text: string; id: number } | null;

/** A success message that can be shown repeatedly (each call gets a fresh id). */
export function useNotice() {
  const [notice, setNotice] = useState<Notice>(null);
  const notify = useCallback((text: string | null) => setNotice((n) => (text === null ? null : { text, id: (n?.id ?? 0) + 1 })), []);
  return [notice, notify] as const;
}

/** Polite live region for success messages. It stays mounted so screen readers announce changes; the text fades after a few seconds. */
export function StatusMessage({ notice, className }: { notice: Notice; className?: string }) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) return;
    const t = setTimeout(() => setDismissedId(id), 6000);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <p role="status" aria-live="polite" className={cn("text-sm text-good", className)}>
      {notice && notice.id !== dismissedId ? notice.text : ""}
    </p>
  );
}
