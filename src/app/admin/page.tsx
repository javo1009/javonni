import type { Metadata } from "next";
import Link from "next/link";
import { ACTION_LABEL, formatBytes } from "@/components/admin/format";
import {
  Badge,
  Banner,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Metric,
  PageHeader,
  ProgressBar,
} from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { adminOverview } from "@/services/admin";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const { actor, db, user } = await adminContext();
  const o = await adminOverview(db, actor);
  const activeUsers =
    o.users.student.active + o.users.teacher.active + o.users.admin.active;
  const disabledUsers =
    o.users.student.disabled +
    o.users.teacher.disabled +
    o.users.admin.disabled;
  const when = (d: Date | null) =>
    d ? formatDateTime(d, user.timezone) : "never";
  const quotaPct = o.files.heaviest
    ? o.files.heaviest.bytes / o.files.quotaPerUser
    : 0;
  const maxSource = Math.max(1, ...o.questions.bySource.map((s) => s.n));

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Platform overview"
        description="Who is using the platform, what they have stored, and whether the question bank covers the curriculum."
      />

      <div className="mb-6 space-y-3">
        {o.demoAccounts > 0 && (
          <Banner
            tone="warn"
            title="Demo accounts exist — remove before real use"
          >
            {plural(o.demoAccounts, "account")} use the{" "}
            <code className="font-mono">@ascent.demo</code> domain and share a
            published password, so anyone who has read the setup notes can sign
            in as them.{" "}
            <Link
              href="/admin/users?q=%40ascent.demo"
              className="font-semibold underline"
            >
              Review and disable them
            </Link>
            .
          </Banner>
        )}
        {!o.curriculum && (
          <Banner tone="risk" title="No active curriculum">
            Students can&apos;t track modules until a curriculum is active. Run
            the deploy setup (<code className="font-mono">npm run db:seed</code>
            ).
          </Banner>
        )}
        {o.curriculum?.isSample && (
          <Banner
            tone="warn"
            title="The active curriculum is flagged as sample data"
          >
            Replace it with the official module list through the deploy setup
            before real use.
          </Banner>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <Metric
          primary
          label="Active accounts"
          value={activeUsers.toLocaleString()}
          hint={`${plural(o.users.student.active, "student")} · ${plural(o.users.teacher.active, "teacher")} · ${plural(o.users.admin.active, "admin")}${disabledUsers ? ` · ${disabledUsers} disabled` : ""}`}
        />
        <Metric
          label="Active classes"
          value={o.classes.active.toLocaleString()}
          hint={
            o.classes.archived
              ? `${o.classes.archived} archived`
              : "None archived"
          }
        />
        <Metric
          label="Students enrolled"
          value={o.studentsEnrolled.toLocaleString()}
          hint="In at least one active class"
        />
        <Metric
          label="Assignments"
          value={o.assignments.total.toLocaleString()}
          hint={`${o.assignments.assigned.toLocaleString()} assigned · ${o.assignments.draft.toLocaleString()} drafts`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card aria-labelledby="bank-h">
          <CardHeader
            id="bank-h"
            title="Question bank"
            subtitle={`${o.questions.published.toLocaleString()} published${o.questions.unpublished ? ` · ${o.questions.unpublished} unpublished` : ""}`}
          />
          <CardBody className="space-y-4">
            {o.questions.bySource.length === 0 ? (
              <p className="text-sm text-ink-2">No published questions yet.</p>
            ) : (
              <ul className="space-y-3">
                {o.questions.bySource.map((s) => (
                  <li key={s.source}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium capitalize text-ink">
                        {s.source}
                      </span>
                      <span className="tabular text-ink-2">
                        {s.n.toLocaleString()}
                      </span>
                    </div>
                    <ProgressBar
                      value={s.n}
                      max={maxSource}
                      label={`${s.source} questions`}
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-ink">
                {o.modulesWithoutQuestions.count === 0
                  ? "Every module has questions"
                  : `${o.modulesWithoutQuestions.count} of ${o.modulesWithoutQuestions.total} modules have no questions`}
              </p>
              {o.modulesWithoutQuestions.examples.length > 0 && (
                <p className="mt-1 text-ink-2">
                  e.g.{" "}
                  {o.modulesWithoutQuestions.examples
                    .slice(0, 3)
                    .map((m) => `${m.topic} ${m.number}`)
                    .join(", ")}
                  {o.modulesWithoutQuestions.count > 3 ? "…" : ""}
                </p>
              )}
              <Link
                href="/admin/coverage"
                className="mt-2 inline-block font-semibold text-link underline-offset-2 hover:underline"
              >
                Open question coverage
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card aria-labelledby="storage-h">
          <CardHeader
            id="storage-h"
            title="Homework files"
            subtitle="Stored in the database; no extra storage service."
          />
          <CardBody className="space-y-4">
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-sm font-semibold text-ink-2">Files</p>
                <p className="tabular text-3xl font-bold tracking-tight text-ink">
                  {o.files.count.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-2">Total stored</p>
                <p className="tabular text-3xl font-bold tracking-tight text-ink">
                  {formatBytes(o.files.bytes)}
                </p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">
                  Heaviest uploader vs quota
                </span>
                <span className="tabular text-ink-2">
                  {o.files.heaviest
                    ? formatBytes(o.files.heaviest.bytes)
                    : "0 B"}{" "}
                  of {formatBytes(o.files.quotaPerUser)}
                </span>
              </div>
              <ProgressBar
                value={quotaPct}
                label="Heaviest uploader's share of the per-user quota"
              />
              <p className="mt-2 text-sm text-ink-2">
                {o.files.heaviest
                  ? `${o.files.heaviest.name} stores the most (${Math.round(quotaPct * 100)}% of their ${formatBytes(o.files.quotaPerUser)} allowance).`
                  : "Nobody has uploaded a file yet."}{" "}
                Each account has its own quota.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card aria-labelledby="curr-h">
          <CardHeader id="curr-h" title="Active curriculum" />
          <CardBody className="space-y-3">
            {o.curriculum ? (
              <>
                <p className="text-lg font-semibold tracking-tight text-ink">
                  {o.curriculum.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="brand">{o.curriculum.year}</Badge>
                  <Badge>{o.curriculum.topics} topics</Badge>
                  <Badge>{o.curriculum.modules} modules</Badge>
                  <Badge tone={o.curriculum.isSample ? "warn" : "good"}>
                    {o.curriculum.isSample ? "Sample data" : "Official list"}
                  </Badge>
                </div>
                <Link
                  href="/admin/curriculum"
                  className="inline-block text-sm font-semibold text-link underline-offset-2 hover:underline"
                >
                  View topics and modules
                </Link>
              </>
            ) : (
              <EmptyState title="Nothing active">
                Run the deploy setup to seed the curriculum.
              </EmptyState>
            )}
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Latest account created</dt>
                <dd className="text-right text-ink">
                  {when(o.latest.accountCreated)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Latest question added</dt>
                <dd className="text-right text-ink">
                  {when(o.latest.questionAdded)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="activity-h">
          <CardHeader id="activity-h" title="Recent admin activity" />
          <CardBody>
            {o.recentActivity.length === 0 ? (
              <p className="text-sm text-ink-2">
                Nothing yet. Account changes and question imports are recorded
                here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {o.recentActivity.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="font-medium text-ink">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.action === "questions.import" &&
                      typeof a.meta.imported === "number"
                        ? ` (${a.meta.imported})`
                        : ""}
                    </span>
                    <span className="text-ink-2">
                      {a.actorName ?? "System"} ·{" "}
                      <time dateTime={a.createdAt.toISOString()}>
                        {formatDateTime(a.createdAt, user.timezone)}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="links-h">
          <CardHeader id="links-h" title="Quick links" />
          <CardBody className="flex flex-col gap-2">
            <ButtonLink
              href="/admin/users"
              variant="secondary"
              className="justify-start"
            >
              Create or manage accounts
            </ButtonLink>
            <ButtonLink
              href="/admin/coverage#import"
              variant="secondary"
              className="justify-start"
            >
              Import questions from CSV
            </ButtonLink>
            <ButtonLink
              href="/admin/coverage"
              variant="secondary"
              className="justify-start"
            >
              Check question coverage
            </ButtonLink>
            <ButtonLink
              href="/admin/curriculum"
              variant="secondary"
              className="justify-start"
            >
              Browse the curriculum
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
