import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Banner, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Stat, StatusPill, TableWrap, td, th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { coverageReport, type CoverageRow } from "@/services/admin";

export const metadata: Metadata = { title: "Coverage" };

type Search = Promise<{ topic?: string | string[]; show?: string | string[] }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SHOW = { all: "All objectives", gaps: "Gaps only", questions: "Too few questions", plan: "Not in any plan" } as const;
type Show = keyof typeof SHOW;

function gapText(r: CoverageRow, min: number, plansExist: boolean): string[] {
  const out: string[] = [];
  if (r.questions === 0) out.push(`No questions (needs ${min})`);
  else if (r.belowMin) out.push(`Needs ${min - r.questions} more ${min - r.questions === 1 ? "question" : "questions"}`);
  if (plansExist && !r.inActivePlan) out.push("No plan task");
  return out;
}

export default async function CoveragePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { actor, db } = await adminContext();
  const report = await coverageReport(db, actor);

  if (!report) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Coverage" />
        <EmptyState title="No active curriculum" action={<ButtonLink href="/admin/curriculum">Import a curriculum</ButtonLink>}>
          Coverage is measured against the active curriculum version.
        </EmptyState>
      </>
    );
  }

  const { summary, minQuestions: min, activePlans } = report;
  const plansExist = activePlans > 0;
  const topicCode = one(sp.topic) ?? "";
  const topic = report.summary.topics.find((t) => t.code === topicCode);
  const showRaw = one(sp.show) ?? "all";
  const show: Show = showRaw in SHOW ? (showRaw as Show) : "all";

  const rows = report.rows.filter((r) => {
    if (topic && r.topicId !== topic.id) return false;
    const planGap = plansExist && !r.inActivePlan;
    if (show === "gaps") return r.belowMin || planGap;
    if (show === "questions") return r.belowMin;
    if (show === "plan") return planGap;
    return true;
  });
  const pctCovered = summary.totalLos ? Math.round((summary.covered / summary.totalLos) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Coverage"
        description={`Every objective in “${report.version.name}” needs at least ${min} published questions and a study task in student plans.`}
      />

      {report.version.isSample && (
        <div className="mb-6">
          <Banner tone="warn" title="Measuring the sample curriculum">
            These gaps are for the demo objectives. Import the official outline to measure real coverage.
          </Banner>
        </div>
      )}

      <Card className="mb-6" aria-labelledby="sum-h">
        <CardHeader id="sum-h" title="Summary" />
        <CardBody>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat label="Objectives covered" value={`${summary.covered.toLocaleString()} / ${summary.totalLos.toLocaleString()}`} hint={`${pctCovered}% have ≥ ${min} questions`} />
            <Stat
              label="Below minimum"
              value={summary.belowMin.toLocaleString()}
              tone={summary.belowMin ? "risk" : undefined}
              hint={summary.belowMin ? `${summary.zeroQuestions} with no questions` : "No gaps"}
            />
            <Stat label="Questions needed" value={summary.questionsNeeded.toLocaleString()} hint={`to reach ${min} per objective`} />
            <Stat
              label="Not in any plan"
              value={plansExist ? summary.notInAnyPlan.toLocaleString() : "—"}
              tone={plansExist && summary.notInAnyPlan ? "warn" : undefined}
              hint={plansExist ? `across ${plural(activePlans, "active plan")}` : "No active plans use this version yet"}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6" aria-labelledby="topics-h">
        <CardHeader id="topics-h" title="By topic" />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.topics.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/coverage?topic=${encodeURIComponent(t.code)}&show=${show}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-surface-2",
                    t.code === topicCode ? "border-brand bg-brand-soft/40" : "border-border",
                  )}
                  aria-current={t.code === topicCode ? "true" : undefined}
                >
                  <span className="min-w-0 truncate text-ink">
                    <span className="font-mono text-xs text-ink-2">{t.code}</span> {t.name}
                  </span>
                  <span className={cn("shrink-0 tabular", t.belowMin ? "font-medium text-risk" : "text-good")}>
                    {t.belowMin ? `${t.belowMin} of ${t.los} short` : `All ${t.los} OK`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Form action="/admin/coverage" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter objectives">
        <div className="space-y-1.5">
          <label htmlFor="topic" className="block text-sm font-medium text-ink">
            Topic
          </label>
          <Select id="topic" name="topic" defaultValue={topic?.code ?? ""} className="w-full sm:w-72">
            <option value="">All topics</option>
            {summary.topics.map((t) => (
              <option key={t.id} value={t.code}>
                {t.code} · {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="show" className="block text-sm font-medium text-ink">
            Show
          </label>
          <Select id="show" name="show" defaultValue={show} className="w-full sm:w-56">
            {Object.entries(SHOW).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(topic || show !== "all") && (
          <Link href="/admin/coverage" className="pb-2 text-sm font-medium text-brand hover:underline">
            Clear filters
          </Link>
        )}
      </Form>

      <p className="mb-3 text-sm text-ink-2" role="status">
        Showing {plural(rows.length, "objective")}
        {topic ? ` in ${topic.name}` : ""}
        {show !== "all" ? ` · ${SHOW[show].toLowerCase()}` : ""}.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Nothing to show">No objectives match these filters{show !== "all" ? ", so there are no gaps here" : ""}.</EmptyState>
      ) : (
        <TableWrap label="Objective coverage">
          <table className="w-full">
            <caption className="sr-only">
              Coverage per objective. Rows marked Gap are below {min} published questions or have no plan task.
            </caption>
            <thead className="sticky top-0 border-b border-border bg-surface">
              <tr>
                <th scope="col" className={th}>
                  Code
                </th>
                <th scope="col" className={th}>
                  Objective
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Questions
                </th>
                <th scope="col" className={th}>
                  In a plan
                </th>
                <th scope="col" className={th}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const gaps = gapText(r, min, plansExist);
                const isGap = gaps.length > 0;
                return (
                  <tr key={r.losId} className={isGap ? "bg-risk-soft/40" : undefined}>
                    <th scope="row" className={`${td} whitespace-nowrap text-left font-mono text-xs font-normal`}>
                      {r.code}
                    </th>
                    <td className={td}>
                      <p className="text-ink">{r.text}</p>
                      <p className="text-xs text-ink-2">
                        {r.topicCode} · {r.moduleTitle} · {r.commandWord} · importance {r.importance}
                      </p>
                    </td>
                    <td className={`${td} tabular text-right`}>
                      <span className={r.belowMin ? "font-semibold text-risk" : undefined}>{r.questions}</span>
                      <span className="text-ink-2"> / {min}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{plansExist ? (r.inActivePlan ? "Yes" : <span className="font-medium text-warn">No</span>) : "—"}</td>
                    <td className={`${td} min-w-44`}>
                      {isGap ? (
                        <div className="space-y-0.5">
                          <StatusPill tone="risk" label="Gap" />
                          {gaps.map((g) => (
                            <p key={g} className="text-xs text-ink-2">
                              {g}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <StatusPill tone="good" label="Covered" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
