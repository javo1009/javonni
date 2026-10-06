"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { NO_FILTER, type ChapterFilter } from "@/lib/tracker-view";
import { formatDayLong } from "@/lib/tracker-dates";
import { fmtHours } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import { ChaptersView } from "./chapters-view";
import { HoursView } from "./hours-view";
import type { TrackerTab } from "./links";
import { MocksView } from "./mocks-view";
import { OverviewView } from "./overview-view";

const TABS: { id: TrackerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chapters", label: "Chapters" },
  { id: "hours", label: "Hours" },
  { id: "mocks", label: "Mocks" },
];

/**
 * The student's tracker, read-only, for a teacher: the same panels the student sees (overview, chapters,
 * hours, mocks) with their own in-page tabs. No checkboxes, forms, timer, backup or practice links.
 */
export function ReadOnlyTracker({ snapshot }: { snapshot: TrackerSnapshot }) {
  const [tab, setTab] = useState<TrackerTab>("overview");
  const [filter, setFilter] = useState<ChapterFilter>(NO_FILTER);
  const [filterKey, setFilterKey] = useState(0);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const go = (next: TrackerTab, f?: Partial<ChapterFilter>) => {
    if (next === "chapters") {
      setFilter({ ...NO_FILTER, ...f });
      setFilterKey((k) => k + 1);
    }
    setTab(next);
    requestAnimationFrame(() => refs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  function onKey(e: KeyboardEvent, i: number) {
    const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? TABS.length : 0;
    if (!move) return;
    e.preventDefault();
    const next = TABS[(i + move + TABS.length) % TABS.length].id;
    setTab(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        Exam {formatDayLong(snapshot.examDate)} · {fmtHours(snapshot.weeklyTargetHours)} h a week target · {snapshot.daysLeft} {snapshot.daysLeft === 1 ? "day" : "days"} to go. Read-only view.
      </p>
      <div role="tablist" aria-label="Student tracker sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-3 sm:mx-0 sm:px-0">
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`ro-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`ro-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn("relative whitespace-nowrap px-4 pb-4 pt-3 text-[0.94rem] font-semibold transition-colors max-sm:min-h-11 max-sm:px-3", active ? "text-ink" : "text-ink-3 hover:text-ink")}
            >
              {t.label}
              {active && <span aria-hidden className="absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-[3px] bg-brand" />}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`ro-panel-${tab}`} aria-labelledby={`ro-tab-${tab}`} tabIndex={0} className="outline-offset-4">
        {tab === "overview" && <OverviewView snapshot={snapshot} readOnly onTab={go} />}
        {tab === "chapters" && <ChaptersView key={filterKey} snapshot={snapshot} readOnly initialFilter={filter} onTab={go} />}
        {tab === "hours" && <HoursView snapshot={snapshot} readOnly />}
        {tab === "mocks" && <MocksView snapshot={snapshot} readOnly />}
      </div>
    </div>
  );
}
