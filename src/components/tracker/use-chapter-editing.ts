"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { setChapter } from "@/app/actions/student";
import type { ISODate } from "@/domain/dates";
import { applyChapterPatch } from "@/lib/tracker-view";
import type { ChapterPatch, ChapterView } from "@/services/tracker";

/**
 * Chapter list with instant (optimistic) edits. `update` applies the change on screen straight away,
 * runs the server action in a transition, and the optimistic copy is dropped when the server's
 * fresh snapshot arrives (or reverted, with `error` set, if the save failed).
 */
export function useChapterEditing(
  chapters: ChapterView[],
  today: ISODate,
  readOnly: boolean,
) {
  const [optimistic, applyOptimistic] = useOptimistic(
    chapters,
    (current, change: { id: string; patch: ChapterPatch }) =>
      current.map((c) =>
        c.id === change.id ? applyChapterPatch(c, change.patch, today) : c,
      ),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    (id: string, patch: ChapterPatch) => {
      if (readOnly) return;
      setError(null);
      startTransition(async () => {
        applyOptimistic({ id, patch });
        try {
          const r = await setChapter({ moduleId: id, patch });
          if (!r.ok) setError(r.error);
        } catch {
          setError(
            "Couldn't save that change. Check your connection and try again.",
          );
        }
      });
    },
    [applyOptimistic, readOnly],
  );

  return {
    chapters: optimistic,
    update,
    pending,
    error,
    clearError: () => setError(null),
  };
}

export type ChapterUpdate = ReturnType<typeof useChapterEditing>["update"];
