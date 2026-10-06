// Study-improvement panels: spaced-review queue, finish forecast, weak-chapter practice,
// exam-weighted coverage and confidence calibration. Shared by the student pages and the read-only teacher view.
import { TRACKER } from "@/domain/tracker";
import { Badge, ButtonLink, Button, ProgressBar } from "@/components/ui";
import { plural } from "@/lib/format";
import { formatShortDate } from "@/lib/tracker-dates";
import {
  biggestWeightGap,
  fmtHours,
  forecastSummary,
  upcomingReviews,
  weakChapters,
  type ChapterCounts,
  type TopicCounts,
} from "@/lib/tracker-view";
import type { ChapterView, TrackerSnapshot } from "@/services/tracker";
import { TabLink, practiceHref, type OnTab } from "./links";
import { Hint, Note, Panel } from "./panel";
import type { ChapterUpdate } from "./use-chapter-editing";

const linkCls =
  "inline-flex min-h-8 items-center text-sm font-bold text-link hover:underline max-sm:min-h-11";

// ------------------------------------------------------------ review queue
export function ReviewQueuePanel({
  snapshot,
  chapters,
  readOnly,
  update,
  onTab,
  limit,
  onShowDue,
}: {
  snapshot: TrackerSnapshot;
  chapters: ChapterView[];
  readOnly: boolean;
  update: ChapterUpdate;
  onTab?: OnTab;
  /** Show at most this many due items (the rest are reachable through "show all"). */
  limit: number;
  /** On the chapters page: filter the list below to due chapters instead of linking away. */
  onShowDue?: () => void;
}) {
  const live = new Map(chapters.map((c) => [c.id, c]));
  const topicName = new Map(snapshot.topics.map((t) => [t.id, t.name]));
  const due = snapshot.reviewQueue.filter(
    (q) => live.get(q.moduleId)?.reviewDue,
  );
  const shown = due.slice(0, limit);
  const upcoming = upcomingReviews(chapters, snapshot.today, 7);
  return (
    <Panel
      id="review-title"
      eyebrow="SPACED REVIEW"
      title="Review today"
      action={
        <Badge tone={due.length ? "warn" : "good"}>
          {due.length ? `${due.length} due` : "All caught up"}
        </Badge>
      }
    >
      <p className="mb-3 text-sm text-ink-2">
        Chapters come back for review 3 days after you read them, and again 21
        days after each review. A short, timely review beats rereading later.
      </p>
      {shown.length ? (
        <ul aria-label="Chapters due for review">
          {shown.map((q) => (
            <li
              key={q.moduleId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <strong className="block text-[0.9rem] font-semibold leading-snug text-ink">
                  {q.title}
                </strong>
                <span className="text-[0.8rem] text-ink-2">
                  {topicName.get(q.topicId)} ·{" "}
                  {q.kind === "first-review" ? "First review" : "Refresh"} ·{" "}
                  {q.overdueDays === 0
                    ? "due today"
                    : `${plural(q.overdueDays, "day")} overdue`}
                </span>
              </div>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update(q.moduleId, { reviewedToday: true })}
                  aria-label={`Mark reviewed today: ${q.title}`}
                >
                  Reviewed today
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Hint>
          Nothing is due for review. Read a chapter and it will appear here
          three days later.
        </Hint>
      )}
      {due.length > shown.length &&
        (onShowDue ? (
          <button type="button" onClick={onShowDue} className={linkCls}>
            Show all {due.length} due in the list below
          </button>
        ) : (
          <TabLink
            tab="chapters"
            filter={{ status: "due" }}
            readOnly={readOnly}
            onTab={onTab}
            className={linkCls}
          >
            See all {due.length} due chapters
          </TabLink>
        ))}
      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-ink">Coming this week</h3>
          <ul
            className="mt-1.5 space-y-1 text-sm text-ink-2"
            aria-label="Reviews coming due this week"
          >
            {upcoming.slice(0, 4).map((u) => (
              <li key={u.moduleId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{u.title}</span>
                <span className="shrink-0 text-ink-3">
                  {u.inDays === 1 ? "tomorrow" : formatShortDate(u.due)}
                </span>
              </li>
            ))}
          </ul>
          {upcoming.length > 4 && (
            <p className="mt-1 text-sm text-ink-3">
              and {upcoming.length - 4} more
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- forecast
export function ForecastPanel({
  snapshot,
  counts,
}: {
  snapshot: TrackerSnapshot;
  counts: ChapterCounts;
}) {
  const { chapterPace: pace, roadmap, today, examDate } = snapshot;
  const f = forecastSummary(
    pace,
    roadmap,
    counts.total - counts.read,
    today,
    examDate,
  );
  const behind = pace.expectedRead - counts.read;
  return (
    <Panel
      id="forecast-title"
      eyebrow="FINISH FORECAST"
      title="Will you finish in time?"
      action={
        <Badge tone={behind > 0 ? "warn" : "good"}>
          {behind > 0
            ? `${plural(behind, "chapter")} behind`
            : behind < 0
              ? `${plural(-behind, "chapter")} ahead`
              : "On the roadmap"}
        </Badge>
      }
    >
      <p className="text-[1.35rem] font-bold leading-tight tracking-[-0.03em] text-ink">
        {f.headline}
      </p>
      <p className="mt-1.5 text-sm text-ink-2">{f.detail}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-ink-3">Read so far</dt>
          <dd className="tabular text-xl font-bold text-ink">{counts.read}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Roadmap expects</dt>
          <dd className="tabular text-xl font-bold text-ink">
            {pace.expectedRead}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Recent pace</dt>
          <dd className="tabular text-xl font-bold text-ink">
            {pace.weeklyRate === null ? "n/a" : fmtHours(pace.weeklyRate)}
            <span className="ml-1 text-xs font-normal text-ink-3">/ wk</span>
          </dd>
        </div>
      </dl>
      <ProgressBar
        value={counts.read}
        max={counts.total}
        label="Chapters read of the whole syllabus"
        className="mt-4"
      />
      <p className="mt-2 text-xs text-ink-3">
        {counts.total - counts.read} chapters left to read. The roadmap finishes
        the first pass on {formatShortDate(roadmap.firstPassEnd)}; the exam is{" "}
        {formatShortDate(examDate)}.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------- weak practice
export function WeakPracticePanel({
  chapters,
  readOnly,
}: {
  chapters: ChapterView[];
  readOnly: boolean;
}) {
  const weak = weakChapters(chapters, 5);
  const totalWeak = chapters.filter(
    (c) => c.state.accuracy !== null && c.state.accuracy < TRACKER.weakScore,
  ).length;
  return (
    <Panel
      id="weak-title"
      eyebrow="PRACTICE"
      title="Weak chapters"
      action={
        !readOnly && (
          <ButtonLink href={practiceHref({ scope: "weak" })} size="sm">
            Practise weak chapters
          </ButtonLink>
        )
      }
    >
      {weak.length ? (
        <>
          <ul aria-label="Chapters with the lowest practice scores">
            {weak.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-ink">
                    {c.title}
                  </span>
                  {c.practice && (
                    <span className="text-xs text-ink-3">
                      Platform questions: {c.practice.correct}/
                      {c.practice.attempts} correct
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular text-sm font-bold text-warn">
                    {c.state.accuracy}%
                  </span>
                  {!readOnly && (
                    <ButtonLink
                      href={practiceHref({ moduleId: c.id })}
                      variant="ghost"
                      size="sm"
                      aria-label={`Practise ${c.title}`}
                    >
                      Practise
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {totalWeak > weak.length && (
            <p className="mt-2 text-sm text-ink-3">
              and {totalWeak - weak.length} more below 70%
            </p>
          )}
        </>
      ) : (
        <div>
          <Hint>
            No chapter is scoring below 70% yet. Enter a practice score on a
            chapter, or work through questions in Practice, and your weakest
            chapters will show up here.
          </Hint>
          {!readOnly && (
            <ButtonLink
              href={practiceHref({ scope: "mixed" })}
              variant="secondary"
              size="sm"
              className="mt-3"
            >
              Practise a mixed set
            </ButtonLink>
          )}
        </div>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------- coverage
export function CoveragePanel({
  snapshot,
  counts,
  total,
}: {
  snapshot: TrackerSnapshot;
  counts: Map<string, TopicCounts>;
  total: ChapterCounts;
}) {
  const { topics, totals } = snapshot;
  const gap = biggestWeightGap(topics, counts);
  const chaptersPct = total.total
    ? Math.round((total.read / total.total) * 100)
    : 0;
  return (
    <Panel
      id="coverage-title"
      eyebrow="EXAM-WEIGHTED COVERAGE"
      title="Coverage by exam weight"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-ink-2">Read, by exam weight</p>
          <p className="tabular text-3xl font-bold tracking-tight text-ink">
            {totals.weightedReadPct}%
          </p>
          <p className="text-xs text-ink-3">{chaptersPct}% by chapter count</p>
        </div>
        <div>
          <p className="text-sm text-ink-2">Fully reviewed, by exam weight</p>
          <p className="tabular text-3xl font-bold tracking-tight text-ink">
            {totals.weightedCompletePct}%
          </p>
          <p className="text-xs text-ink-3">
            {total.total ? Math.round((total.complete / total.total) * 100) : 0}
            % by chapter count
          </p>
        </div>
      </div>
      {gap && (
        <Note>
          Biggest gap: <strong className="text-ink">{gap.topic.name}</strong> (
          {gap.topic.weightLabel} of the exam), {gap.read}/{gap.total} read.
        </Note>
      )}
      <ul
        className="mt-4 space-y-3"
        aria-label="Chapters read by topic, with exam weight"
      >
        {topics.map((t) => {
          const c = counts.get(t.id) ?? {
            total: t.total,
            read: t.read,
            complete: t.complete,
          };
          return (
            <li key={t.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium text-ink">
                  {t.name}{" "}
                  <span className="font-normal text-ink-3">
                    · {t.weightLabel}
                  </span>
                </span>
                <span className="tabular shrink-0 text-ink-2">
                  {c.read}/{c.total} read
                </span>
              </div>
              <ProgressBar
                value={c.read}
                max={c.total}
                label={`${t.name} chapters read`}
                className="mt-1.5 h-[5px]"
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ------------------------------------------------------------ calibration
export function CalibrationPanel({
  chapters,
  readOnly,
}: {
  chapters: ChapterView[];
  readOnly: boolean;
}) {
  // Recompute from the live (optimistic) chapters so a new rating shows straight away.
  const rated = chapters.filter((c) => c.state.confidence !== null).length;
  const over = chapters.filter(
    (c) =>
      c.state.confidence === 3 &&
      c.state.accuracy !== null &&
      c.state.accuracy < TRACKER.weakScore,
  );
  const under = chapters.filter(
    (c) =>
      c.state.confidence === 1 &&
      c.state.accuracy !== null &&
      c.state.accuracy >= 80,
  );
  return (
    <Panel
      id="calibration-title"
      eyebrow="CONFIDENCE"
      title="Do you know what you know?"
    >
      <p className="text-sm text-ink-2">
        Rate each chapter shaky, OK or solid. Where your confidence and your
        practice score disagree, that&apos;s where revision pays off most.
      </p>
      {rated === 0 ? (
        <Hint className="mt-3">
          You haven&apos;t rated any chapters yet. Use the confidence menu on a
          chapter row, then come back to see how it compares with your scores.
        </Hint>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-3">
            Rated {rated} of {chapters.length} chapters.
          </p>
          <div className="mt-3 space-y-4">
            <CalibrationList
              title="Rated solid, scoring below 70%"
              tone="risk"
              note="Likely blind spots. Practise these first."
              items={over}
              empty="None. Your solid chapters score well."
              readOnly={readOnly}
              practise
            />
            <CalibrationList
              title="Rated shaky, scoring 80% or more"
              tone="good"
              note="You probably know these better than you think."
              items={under}
              empty="None. Your shaky chapters really are shaky."
              readOnly={readOnly}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

function CalibrationList({
  title,
  note,
  items,
  empty,
  readOnly,
  practise,
  tone,
}: {
  title: string;
  note: string;
  items: ChapterView[];
  empty: string;
  readOnly: boolean;
  practise?: boolean;
  tone: "risk" | "good";
}) {
  return (
    <section aria-label={title}>
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        {title}
        <Badge tone={items.length ? tone : "neutral"}>{items.length}</Badge>
      </h3>
      <p className="text-xs text-ink-3">{note}</p>
      {items.length ? (
        <ul className="mt-1.5">
          {items.slice(0, 5).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0">{c.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular font-semibold text-ink-2">
                  {c.state.accuracy}%
                </span>
                {practise && !readOnly && (
                  <ButtonLink
                    href={practiceHref({ moduleId: c.id })}
                    variant="ghost"
                    size="sm"
                    aria-label={`Practise ${c.title}`}
                  >
                    Practise
                  </ButtonLink>
                )}
              </span>
            </li>
          ))}
          {items.length > 5 && (
            <li className="pt-1.5 text-sm text-ink-3">
              and {items.length - 5} more
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-2">{empty}</p>
      )}
    </section>
  );
}
