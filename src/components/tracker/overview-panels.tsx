// The Overview tab's panels: metric tiles, pace, today's focus, roadmap and next actions.
// All take plain snapshot data and, where a panel can change something, an update callback.
import { Badge, Metric, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDayLong, formatShortDate } from "@/lib/format";
import { TRACKER } from "@/domain/tracker";
import { fmtHours, phaseLabel, weekRange, type ChapterCounts, type TopicCounts } from "@/lib/tracker-view";
import type { ChapterView, TrackerSnapshot } from "@/services/tracker";
import { TabLink, type OnTab } from "./links";
import { Hint, Panel } from "./panel";
import type { ChapterUpdate } from "./use-chapter-editing";

const pctOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

// ----------------------------------------------------------------- metrics
export function MetricsRow({ snapshot, counts }: { snapshot: TrackerSnapshot; counts: ChapterCounts }) {
  const { week, totals, daysLeft, examDate, phase } = snapshot;
  const reached = week.hours >= week.targetHours;
  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 lg:grid-cols-4">
      <Metric
        primary
        label="This week"
        value={fmtHours(week.hours)}
        unit={`/ ${fmtHours(week.targetHours)} h`}
        meter={week.targetHours > 0 ? week.hours / week.targetHours : 0}
        hint={`${weekRange(week.start, week.end)}${reached ? " · target reached" : ""}`}
      />
      <Metric
        label="Chapters read"
        value={counts.read}
        unit={`/ ${counts.total}`}
        meter={counts.total ? counts.read / counts.total : 0}
        hint={`${pctOf(counts.read, counts.total)}% of the syllabus · ${totals.weightedReadPct}% by exam weight`}
      />
      <Metric
        label="Chapters fully reviewed"
        value={counts.complete}
        unit={`/ ${counts.total}`}
        meter={counts.total ? counts.complete / counts.total : 0}
        hint={`Read, practised and reviewed · ${pctOf(counts.complete, counts.total)}%`}
      />
      <Metric
        label="Time remaining"
        value={daysLeft}
        unit={daysLeft === 1 ? "day" : "days"}
        hint={
          <>
            Until {formatDayLong(examDate)}
            <br />
            {phaseLabel(phase)}
          </>
        }
      />
    </section>
  );
}

// -------------------------------------------------------------------- pace
const PACE: Record<TrackerSnapshot["pace"]["status"], { label: string; tone: "neutral" | "brand" | "good" | "warn" }> = {
  none: { label: "Start logging hours", tone: "neutral" },
  "on-pace": { label: "On pace", tone: "brand" },
  ahead: { label: "Ahead of plan", tone: "good" },
  behind: { label: "Behind plan", tone: "warn" },
};

export function PacePanel({ snapshot }: { snapshot: TrackerSnapshot }) {
  const { pace } = snapshot;
  const s = PACE[pace.status];
  const summary = `${fmtHours(pace.totalHours)} hours logged; ${fmtHours(pace.expectedHours)} hours planned by today, out of about ${Math.round(pace.capacityHours)} hours until the exam.`;
  return (
    <Panel id="pace-title" eyebrow="EXECUTION" title="Study pace" action={<Badge tone={s.tone}>{s.label}</Badge>}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="tabular text-[2.15rem] font-bold leading-none tracking-[-0.04em] text-ink">{fmtHours(pace.totalHours)} h</strong>
        <span className="text-sm text-ink-2">of {fmtHours(pace.expectedHours)} h planned by today</span>
      </div>
      <div role="img" aria-label={summary} className="relative mb-3 mt-5 h-[21px] rounded-full bg-[var(--meter-track)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--meter-from)] to-[var(--meter-to)] transition-[width] duration-300"
          style={{ width: `${pace.loggedFraction * 100}%` }}
        />
        <span aria-hidden className="absolute -top-1 h-[29px] w-[3px] -translate-x-1/2 rounded bg-ink ring-[3px] ring-surface" style={{ left: `${pace.plannedFraction * 100}%` }} />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.79rem] text-ink-3">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-brand" />
          Logged hours
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-[3px] rounded bg-ink" />
          Plan to date
        </li>
        <li className="ml-auto text-ink-3">
          Full plan: about {Math.round(pace.capacityHours)} h at {fmtHours(snapshot.weeklyTargetHours)} h a week
        </li>
      </ul>
      <p className="mt-5 rounded-[9px] bg-surface-2 px-3.5 py-3 text-sm text-ink-2">{pace.message}</p>
    </Panel>
  );
}

// ------------------------------------------------------------------- focus
export function FocusPanel({
  snapshot,
  chapters,
  readOnly,
  update,
  onTab,
}: {
  snapshot: TrackerSnapshot;
  chapters: ChapterView[];
  readOnly: boolean;
  update: ChapterUpdate;
  onTab?: OnTab;
}) {
  const { focus, topics, roadmap } = snapshot;
  const byId = new Map(chapters.map((c) => [c.id, c]));

  if (focus.kind === "topic") {
    const topic = topics.find((t) => t.id === focus.topicId);
    const items = focus.chapterIds.map((id) => byId.get(id)).filter((c): c is ChapterView => !!c);
    const read = items.filter((c) => c.state.read).length;
    return (
      <Panel
        id="focus-title"
        eyebrow="RIGHT NOW"
        title={topic?.name ?? "Current focus"}
        action={topic && <Badge>{topic.weightLabel} exam weight</Badge>}
      >
        <p className="text-sm text-ink-2">
          {formatShortDate(focus.start)}–{formatShortDate(focus.end)} · {items.length} chapters
        </p>
        <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 text-sm">
          <strong className="font-semibold text-ink">
            {read}/{items.length} chapters read
          </strong>
          <span className="tabular text-ink-2">{pctOf(read, items.length)}%</span>
        </div>
        <ProgressBar value={read} max={items.length} label={`${topic?.name ?? "Topic"} chapters read`} />
        <ul className="mt-4 max-h-80 overflow-y-auto" aria-label={`Chapters in ${topic?.name ?? "this topic"}`}>
          {items.map((c) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              {readOnly ? (
                <span className={cn("flex min-h-10 items-center gap-3 py-2 text-sm", c.state.read ? "text-ink-3 line-through" : "text-ink")}>
                  <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded border border-border-strong text-[0.7rem] leading-none">
                    {c.state.read ? "✓" : ""}
                  </span>
                  <span>{c.title}</span>
                  <span className="sr-only">{c.state.read ? "(read)" : "(not read)"}</span>
                </span>
              ) : (
                <label className={cn("flex min-h-10 cursor-pointer items-center gap-3 py-2 text-sm max-sm:min-h-11", c.state.read ? "text-ink-3 line-through" : "text-ink")}>
                  <input type="checkbox" checked={c.state.read} onChange={(e) => update(c.id, { read: e.target.checked })} className="size-[18px] shrink-0" />
                  <span>
                    <span className="sr-only">Mark as read: </span>
                    {c.title}
                  </span>
                </label>
              )}
            </li>
          ))}
        </ul>
        <TabLink tab="chapters" filter={{ topicId: focus.topicId }} readOnly={readOnly} onTab={onTab} className="mt-4 inline-flex min-h-8 items-center text-sm font-bold text-link hover:underline max-sm:min-h-11">
          Open full chapter checklist
        </TabLink>
      </Panel>
    );
  }

  const review = focus.kind === "review";
  const weak = focus.weakIds.map((id) => byId.get(id)).filter((c): c is ChapterView => !!c);
  return (
    <Panel
      id="focus-title"
      eyebrow="RIGHT NOW"
      title={review ? "Review and mock exams" : "Your next topic"}
      action={<Badge>{review ? "Final review" : "Plan not started"}</Badge>}
    >
      <p className="text-sm text-ink-2">
        {review
          ? `${formatShortDate(roadmap.reviewStart)}–${formatShortDate(roadmap.lastStudyDay)} · focus on weak areas and timed practice`
          : `Your first topic starts ${formatShortDate(roadmap.firstPassStart)}. Pick one from the roadmap to start early.`}
      </p>
      <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 text-sm">
        <strong className="font-semibold text-ink">
          {focus.complete}/{focus.total} chapters fully reviewed
        </strong>
        <span className="tabular text-ink-2">{pctOf(focus.complete, focus.total)}%</span>
      </div>
      <ProgressBar value={focus.complete} max={focus.total} label="Chapters fully reviewed" />
      <div className="mt-4">
        {weak.length ? (
          <ul aria-label="Weak chapters to revisit">
            {weak.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
                <span>{c.title}</span>
                <span className="tabular shrink-0 font-semibold text-warn">{c.state.accuracy}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <Hint>Log chapter practice scores to see weak areas here.</Hint>
        )}
      </div>
      <TabLink tab="chapters" readOnly={readOnly} onTab={onTab} className="mt-4 inline-flex min-h-8 items-center text-sm font-bold text-link hover:underline max-sm:min-h-11">
        Open full chapter checklist
      </TabLink>
    </Panel>
  );
}

// ----------------------------------------------------------------- roadmap
export function RoadmapPanel({
  snapshot,
  counts,
  readOnly,
  onTab,
}: {
  snapshot: TrackerSnapshot;
  counts: Map<string, TopicCounts>;
  readOnly: boolean;
  onTab?: OnTab;
}) {
  const { topics, roadmap } = snapshot;
  return (
    <Panel
      id="roadmap-title"
      eyebrow="SYLLABUS"
      title="Topic roadmap"
      action={<span className="text-sm text-ink-2">First pass ends {formatShortDate(roadmap.firstPassEnd)}</span>}
    >
      {roadmap.tight && (
        <p className="mb-3 rounded-[9px] bg-warn-soft px-3.5 py-2.5 text-sm text-warn">With this exam date each topic gets days rather than weeks. Consider a later date if you can.</p>
      )}
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {topics.map((t) => {
          const c = counts.get(t.id) ?? { total: t.total, read: t.read, complete: t.complete };
          return (
            <li key={t.id}>
              <TabLink
                tab="chapters"
                filter={{ topicId: t.id }}
                readOnly={readOnly}
                onTab={onTab}
                aria-label={`${t.name}, ${formatShortDate(t.start)} to ${formatShortDate(t.end)}, ${c.read} of ${c.total} read${t.active ? ", current topic" : ""}. Show its chapters.`}
                className={cn(
                  "grid h-full w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-[10px] border bg-surface-2 px-3.5 py-3 text-left transition-colors max-sm:min-h-11",
                  t.active ? "border-brand bg-brand-soft" : "border-border hover:border-brand/60",
                )}
              >
                <strong className="text-[0.9rem] font-semibold leading-snug text-ink">
                  {t.name}
                  {t.active && <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 align-middle text-[0.65rem] font-bold uppercase tracking-wide text-brand-ink">Now</span>}
                </strong>
                <em className="tabular row-span-2 self-center text-xs not-italic text-ink-2">
                  {c.read}/{c.total} read
                </em>
                <span className="text-[0.78rem] text-ink-3">
                  {formatShortDate(t.start)}–{formatShortDate(t.end)} · {t.total} chapters
                </span>
                <span className="col-span-2 mt-1.5">
                  <ProgressBar value={c.read} max={c.total} label={`${t.name} read`} className="h-[4px]" />
                </span>
              </TabLink>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

// ------------------------------------------------------------ next actions
export function NextActionsPanel({ snapshot, readOnly, onTab }: { snapshot: TrackerSnapshot; readOnly: boolean; onTab?: OnTab }) {
  const { actions, pace, planStart } = snapshot;
  return (
    <Panel id="actions-title" eyebrow="NEXT ACTIONS" title="What to work on">
      <ol>
        {actions.map((a, i) => {
          const body = (
            <>
              <span aria-hidden className="grid size-[25px] shrink-0 place-items-center rounded-[7px] bg-brand-soft text-[0.77rem] font-bold text-brand">
                {i + 1}
              </span>
              <span className="min-w-0">
                <strong className="block text-[0.9rem] font-semibold text-ink">{a.title}</strong>
                <span className="mt-0.5 block text-sm text-ink-2">{a.detail}</span>
              </span>
            </>
          );
          const cls = "flex gap-3 border-b border-border py-3 last:border-b-0";
          return (
            <li key={`${a.title}-${i}`}>
              {a.tab === "overview" ? (
                <div className={cls}>{body}</div>
              ) : (
                <TabLink tab={a.tab} readOnly={readOnly} onTab={onTab} className={cn(cls, "-mx-2 rounded-lg px-2 hover:bg-surface-2 max-sm:min-h-11")}>
                  {body}
                </TabLink>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-5 border-l-2 border-brand/60 bg-surface-2 px-3.5 py-3 text-[0.8rem] leading-relaxed text-ink-2">
        At your weekly target, this plan provides about <strong className="text-ink">{Math.round(pace.capacityHours)} hours</strong> from {formatShortDate(planStart)} to your exam date. CFA Institute reports over{" "}
        {TRACKER.referenceHours} hours on average among successful candidates.{" "}
        <a href="https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam" target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline underline-offset-2">
          Exam guide
        </a>
      </p>
    </Panel>
  );
}
