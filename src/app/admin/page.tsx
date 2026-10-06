import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Banner, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { adminOverview, coverageReport, recentAudit } from "@/services/admin";

export const metadata: Metadata = { title: "Admin" };

const ACTION_LABEL: Record<string, string> = {
  "curriculum.import": "Imported a curriculum version",
  "curriculum.activate": "Activated a curriculum version",
  "user.create": "Created an account",
  "user.disable": "Disabled an account",
  "user.enable": "Enabled an account",
};

function describe(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof meta.name === "string") parts.push(meta.name);
  if (typeof meta.email === "string") parts.push(meta.email);
  if (typeof meta.role === "string") parts.push(meta.role);
  return parts.join(" · ");
}

export default async function AdminHome() {
  const { actor, db, user } = await adminContext();
  const [o, coverage, log] = await Promise.all([adminOverview(db, actor), coverageReport(db, actor), recentAudit(db, actor, 8)]);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Overview" description="Curriculum, question coverage and accounts for this academy." />

      {!o.active ? (
        <div className="mb-6">
          <Banner tone="risk" title="No active curriculum">
            Students can&apos;t build a plan until a curriculum is active. <Link href="/admin/curriculum" className="font-medium underline">Import one</Link> or run{" "}
            <code>npm run db:seed</code> for the sample.
          </Banner>
        </div>
      ) : o.active.isSample ? (
        <div className="mb-6">
          <Banner tone="risk" title="The active curriculum is the built-in sample, not the official outline">
            Its objectives are illustrative and its topic weights are unverified. Before real students rely on it, import the official 2027 Level I
            outline from CFA Institute in <Link href="/admin/curriculum" className="font-medium underline">Curriculum</Link>.
          </Banner>
        </div>
      ) : null}

      <Card className="mb-6" aria-labelledby="counts-h">
        <CardHeader id="counts-h" title="At a glance" />
        <CardBody>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Students", value: o.students },
              { label: "Teachers", value: o.teachers, hint: plural(o.admins, "admin") },
              { label: "Classes", value: o.classes },
              { label: "Questions", value: o.questions.published, hint: o.questions.unpublished ? `${o.questions.unpublished} unpublished` : "published" },
              { label: "Objectives", value: o.active?.los ?? 0, hint: o.active ? `${o.active.topics} topics · ${o.active.modules} modules` : "no active version" },
              { label: "Active plans", value: o.activePlans },
            ].map((s) => (
              <Stat key={s.label} label={s.label} value={s.value.toLocaleString()} hint={s.hint} />
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="curr-h">
          <CardHeader id="curr-h" title="Active curriculum" action={<ButtonLink href="/admin/curriculum" variant="secondary" size="sm">Manage</ButtonLink>} />
          <CardBody className="space-y-3">
            {o.active ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{o.active.name}</p>
                  {o.active.isSample ? <Badge tone="risk">Sample data</Badge> : <Badge tone="good">Imported</Badge>}
                </div>
                <p className="text-sm text-ink-2">
                  Level I · {o.active.year} · {plural(o.active.topics, "topic")}, {plural(o.active.modules, "module")}, {plural(o.active.los, "objective")}
                </p>
                {o.active.sourceNote && <p className="text-sm text-ink-2">Source: {o.active.sourceNote}</p>}
                <p className="text-sm text-ink-2">{plural(o.versions, "version")} stored.</p>
              </>
            ) : (
              <p className="text-sm text-ink-2">None yet.</p>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="cov-h">
          <CardHeader id="cov-h" title="Question coverage" action={<ButtonLink href="/admin/coverage" variant="secondary" size="sm">Open report</ButtonLink>} />
          <CardBody className="space-y-3">
            {coverage ? (
              <>
                <p className="text-ink">
                  <span className="tabular text-2xl font-semibold">{coverage.summary.covered.toLocaleString()}</span>
                  <span className="text-ink-2"> of {coverage.summary.totalLos.toLocaleString()} objectives have at least {coverage.minQuestions} published questions.</span>
                </p>
                {coverage.summary.belowMin > 0 ? (
                  <p className="text-sm text-risk">
                    <strong>Gap:</strong> {plural(coverage.summary.belowMin, "objective")} below the minimum ({coverage.summary.zeroQuestions} with none). About{" "}
                    {plural(coverage.summary.questionsNeeded, "question")} needed.
                  </p>
                ) : (
                  <p className="text-sm text-good">No gaps: every objective meets the minimum.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-2">No active curriculum.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6" aria-labelledby="log-h">
        <CardHeader id="log-h" title="Recent admin activity" />
        <CardBody>
          {log.length === 0 ? (
            <EmptyState title="Nothing yet">Imports, activations and account changes are recorded here.</EmptyState>
          ) : (
            <ol className="divide-y divide-border">
              {log.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                    {describe(e.meta) && <span className="text-ink-2"> · {describe(e.meta)}</span>}
                  </p>
                  <p className="shrink-0 text-sm text-ink-2">
                    {e.actorName ?? "Unknown"} · <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt, user.timezone)}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </>
  );
}
