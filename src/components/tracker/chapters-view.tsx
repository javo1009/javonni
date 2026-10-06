"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Button, EmptyState, ProgressBar } from "@/components/ui";
import {
  NO_FILTER,
  STATUS_FILTERS,
  chapterCounts,
  isFiltered,
  matchesFilter,
  topicCounts,
  type ChapterFilter,
  type StatusFilter,
} from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import { ChapterRow } from "./chapter-row";
import {
  CalibrationPanel,
  CoveragePanel,
  ReviewQueuePanel,
} from "./insight-panels";
import type { OnTab } from "./links";
import { ErrorBanner } from "./messages";
import { SectionHeading } from "./panel";
import { useChapterEditing } from "./use-chapter-editing";

const filterField =
  "h-11 w-full rounded-[9px] border border-border-strong bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-2 focus:outline-brand/30";

/** All chapters: insights on top, then filters and the ten collapsible topic groups. */
export function ChaptersView({
  snapshot,
  readOnly = false,
  initialFilter = NO_FILTER,
  onTab,
}: {
  snapshot: TrackerSnapshot;
  readOnly?: boolean;
  initialFilter?: ChapterFilter;
  onTab?: OnTab;
}) {
  const { chapters, update, error, clearError } = useChapterEditing(
    snapshot.chapters,
    snapshot.today,
    readOnly,
  );
  const [filter, setFilterState] = useState<ChapterFilter>(initialFilter);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const counts = useMemo(() => chapterCounts(chapters), [chapters]);
  const byTopic = useMemo(() => topicCounts(chapters), [chapters]);
  const topicName = useMemo(
    () => new Map(snapshot.topics.map((t) => [t.id, t.name])),
    [snapshot.topics],
  );

  // Filters are local state (seeded from the link you arrived by); no URL syncing, so ticking a box never remounts the list.
  const setFilter = setFilterState;
  // While any filter is on, every group with matches opens.
  const filtered = isFiltered(filter);

  const visible = useMemo(
    () =>
      chapters.filter((c) =>
        matchesFilter(c, topicName.get(c.topicId) ?? "", filter),
      ),
    [chapters, topicName, filter],
  );
  const firstUnfinished = snapshot.topics.find(
    (t) => (byTopic.get(t.id)?.read ?? 0) < t.total,
  )?.id;
  const anyActive = snapshot.topics.some((t) => t.active);

  const isOpen = (id: string, active: boolean) =>
    overrides[id] ??
    (filtered || active || (!anyActive && id === firstUnfinished));
  const setAll = (open: boolean) =>
    setOverrides(Object.fromEntries(snapshot.topics.map((t) => [t.id, open])));

  return (
    <div>
      <ErrorBanner message={error} onDismiss={clearError} />

      <SectionHeading eyebrow="STUDY INSIGHTS" title="Where to focus">
        {readOnly
          ? "How the student is covering the exam weights, what is due for review and where confidence and scores disagree."
          : "What is due for review, how your reading maps onto the exam weights, and where your confidence and scores disagree."}
      </SectionHeading>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ReviewQueuePanel
          snapshot={snapshot}
          chapters={chapters}
          readOnly={readOnly}
          update={update}
          onTab={onTab}
          limit={6}
          onShowDue={() => setFilter({ ...NO_FILTER, status: "due" })}
        />
        <CoveragePanel snapshot={snapshot} counts={byTopic} total={counts} />
        <CalibrationPanel chapters={chapters} readOnly={readOnly} />
      </div>

      <SectionHeading
        eyebrow="2027 CURRICULUM"
        title={`All ${counts.total} learning modules`}
      >
        {readOnly
          ? "Each learning module is one trackable chapter: reading, practice questions and a final review."
          : "Each learning module is one trackable chapter. Check off reading, practice questions and a final review, then add your practice score and how confident you feel."}
      </SectionHeading>

      <form
        role="search"
        aria-label="Filter chapters"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-wrap gap-2.5 rounded-xl border border-border bg-surface p-3"
      >
        <label className="min-w-[14rem] flex-[2_1_16rem]">
          <span className="sr-only">Search chapters</span>
          <input
            type="search"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Search chapters"
            className={filterField}
            autoComplete="off"
          />
        </label>
        <label className="min-w-[11rem] flex-[1_1_12rem]">
          <span className="sr-only">Filter by topic</span>
          <select
            value={filter.topicId}
            onChange={(e) => setFilter({ ...filter, topicId: e.target.value })}
            className={filterField}
          >
            <option value="">All topics</option>
            {snapshot.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[11rem] flex-[1_1_12rem]">
          <span className="sr-only">Filter by status</span>
          <select
            value={filter.status}
            onChange={(e) =>
              setFilter({ ...filter, status: e.target.value as StatusFilter })
            }
            className={filterField}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value === "all"
                  ? s.label
                  : s.value === "due"
                    ? `Due for review (${counts.due})`
                    : s.label}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFilter(NO_FILTER)}
          >
            Clear filters
          </Button>
        )}
      </form>

      <div
        className="my-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm text-ink-2"
        aria-live="polite"
      >
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            <strong className="text-ink">{visible.length}</strong> chapters
            shown
          </span>
          <span>
            <strong className="text-ink">{counts.complete}</strong> fully
            reviewed overall
          </span>
          <span>
            <strong className="text-ink">{counts.due}</strong> due for review
          </span>
          <span>
            <strong className="text-ink">{counts.weak}</strong> below 70%
          </span>
        </p>
        <span className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAll(true)}
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAll(false)}
          >
            Collapse all
          </Button>
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No chapters match those filters"
          action={
            <Button variant="secondary" onClick={() => setFilter(NO_FILTER)}>
              Clear filters
            </Button>
          }
        >
          Try a different search, or clear the filters to see all {counts.total}{" "}
          chapters.
        </EmptyState>
      ) : (
        <div className="grid gap-3.5">
          {snapshot.topics.map((t) => {
            const rows = visible.filter((c) => c.topicId === t.id);
            if (!rows.length) return null;
            const c = byTopic.get(t.id) ?? {
              total: t.total,
              read: t.read,
              complete: t.complete,
            };
            return (
              <details
                key={t.id}
                open={isOpen(t.id, t.active)}
                onToggle={(e) => {
                  const open = e.currentTarget.open;
                  if (open !== isOpen(t.id, t.active))
                    setOverrides((o) => ({ ...o, [t.id]: open }));
                }}
                className="group overflow-hidden rounded-[15px] border border-border bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center gap-x-4 gap-y-2 px-4 py-4 hover:bg-surface-2 max-sm:flex-wrap sm:px-5 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-x-3 gap-y-1 max-sm:basis-full">
                    <strong className="text-base font-semibold text-ink">
                      {t.name}
                    </strong>
                    <small className="text-[0.78rem] text-ink-3">
                      {t.weightLabel} exam weight
                    </small>
                    {t.active && <Badge tone="brand">Now</Badge>}
                  </div>
                  <span className="tabular shrink-0 text-[0.8rem] text-ink-2">
                    {c.read}/{c.total} read · {c.complete}/{c.total} complete
                  </span>
                  <span className="w-24 shrink-0 max-sm:hidden">
                    <ProgressBar
                      value={c.complete}
                      max={c.total}
                      label={`${t.name} fully reviewed`}
                      className="h-1.5"
                    />
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180 motion-reduce:transition-none max-sm:ml-auto"
                  />
                </summary>
                <ul
                  className="border-t border-border"
                  aria-label={`${t.name} chapters`}
                >
                  {rows.map((r) => (
                    <ChapterRow
                      key={r.id}
                      chapter={r}
                      readOnly={readOnly}
                      update={update}
                    />
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
