import { Badge } from "@/components/ui";
import { formatDayLong } from "@/lib/tracker-dates";
import { fmtHours, mockDeadlineStates, mockTrend } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import { MockChart } from "./mock-chart";
import { MockForm } from "./mock-form";
import { MockList } from "./mock-list";
import { Panel } from "./panel";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 px-4 py-3">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="tabular text-2xl font-bold tracking-tight text-ink">{value}</dd>
      {hint && <dd className="text-xs text-ink-3">{hint}</dd>}
    </div>
  );
}

/** Mock exams: stats and deadlines, trend chart, results and (for the student) the add form. */
export function MocksView({ snapshot, readOnly = false }: { snapshot: TrackerSnapshot; readOnly?: boolean }) {
  const { mocks, today, examDate } = snapshot;
  const { stats } = mocks;
  const trend = mockTrend(stats.change);
  const deadlines = mockDeadlineStates(mocks.deadlines, stats.count, today);
  const pct = (n: number | null) => (n === null ? "—" : `${fmtHours(n)}%`);
  const arrow = { up: "▲ ", down: "▼ ", flat: "", none: "" }[trend.dir];

  const main = (
    <div className="space-y-4">
      <Panel id="mock-stats-title" eyebrow="PRACTICE TREND" title="How your mocks are going" action={<Badge>{stats.count ? `${stats.count} recorded` : "No scores yet"}</Badge>}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Latest" value={pct(stats.latest)} />
          <Stat label="Best" value={pct(stats.best)} />
          <Stat label="Average" value={pct(stats.average)} />
          <Stat label="Trend" value={stats.change === null ? "—" : `${stats.change > 0 ? "+" : ""}${fmtHours(stats.change)} pts`} hint={`${arrow}${trend.label}`} />
        </dl>
        <div className="mt-5">
          {mocks.items.length ? (
            <MockChart items={mocks.items} />
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-ink-2">Your mock scores will appear here.</p>
          )}
        </div>
      </Panel>

      <Panel id="mock-deadlines-title" eyebrow="PLAN" title="Two full mocks before the exam">
        <p className="text-sm text-ink-2">Plan two full timed mocks ahead of {formatDayLong(examDate)}. Record the score and what to revisit.</p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {mocks.deadlines.map((d, i) => (
            <li key={d} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <p className="text-sm text-ink-2">Mock {i + 1} by</p>
              <p className="text-lg font-bold tracking-tight text-ink">{formatDayLong(d)}</p>
              <Badge tone={deadlines[i].tone} className="mt-1.5">
                {deadlines[i].done ? "✓ " : ""}
                {deadlines[i].label}
              </Badge>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel id="mock-list-title" eyebrow="RESULTS" title="Results">
        <MockList items={mocks.items} readOnly={readOnly} />
      </Panel>

      <aside className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-brand/40 bg-brand-soft px-5 py-4 text-sm text-ink">
        <strong className="whitespace-normal">After your exam: Practical Skills Module</strong>
        <span className="text-ink-2">
          Reserve 10–20 hours and complete one module before results are released.{" "}
          <a href="https://www.cfainstitute.org/about/governance/policies/psm-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline underline-offset-2">
            CFA Institute policy
          </a>
        </span>
      </aside>
    </div>
  );

  if (readOnly) return main;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
      <MockForm today={today} />
      {main}
    </div>
  );
}
