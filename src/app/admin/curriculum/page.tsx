import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import {
  Badge,
  Banner,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { adminCurriculum } from "@/services/admin";

export const metadata: Metadata = { title: "Curriculum" };

/** Exam weight as a printed range. */
const weightLabel = (min: number, max: number) =>
  min === max ? `${min}%` : `${min}–${max}%`;

export default async function CurriculumPage() {
  const { actor, db, user } = await adminContext();
  const c = await adminCurriculum(db, actor);

  if (!c) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Curriculum" />
        <EmptyState title="No active curriculum">
          Run the deploy setup (npm run db:seed) to load the official 2027 Level
          I module list.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Curriculum"
        description="The topics and modules students track, in study order. This view is read-only."
      />

      <div className="mb-6 space-y-3">
        <Banner tone="brand" title="The official 2027 Level I module list">
          Ten topics and {c.totals.modules} modules, loaded by the deploy setup.
          There is no editing screen: to change the list, update the seed data
          and redeploy. Existing student progress stays attached to its modules.
        </Banner>
        {c.version.isSample && (
          <Banner tone="warn" title="This version is flagged as sample data">
            It isn&apos;t the official list. Replace it before real use.
          </Banner>
        )}
      </div>

      <Card className="mb-6" aria-labelledby="version-h">
        <CardHeader
          id="version-h"
          title={c.version.name}
          action={
            <Badge tone={c.version.isSample ? "warn" : "good"}>
              {c.version.isSample ? "Sample data" : "Not sample data"}
            </Badge>
          }
          subtitle={`Active version · ${c.version.year} · loaded ${formatDateTime(c.version.createdAt, user.timezone)}`}
        />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Topics" value={c.totals.topics} />
            <Stat label="Modules" value={c.totals.modules} />
            <Stat
              label="Study weeks"
              value={c.totals.studyWeeks}
              hint="Suggested first pass"
            />
            <Stat
              label="Published questions"
              value={c.totals.questions.toLocaleString()}
            />
          </div>
          {c.version.sourceNote && (
            <div className="border-t border-border pt-4">
              <p className="max-w-3xl text-sm text-ink-2">
                <span className="font-semibold text-ink">Source note.</span>{" "}
                {c.version.sourceNote}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="topics-h">
        <h2
          id="topics-h"
          className="mb-3 text-xl font-semibold tracking-tight text-ink"
        >
          Topics in study order
        </h2>
        <ol className="space-y-3">
          {c.topics.map((t, i) => {
            const empty = t.modules.filter((m) => m.questionCount === 0).length;
            return (
              <li key={t.id}>
                <details className="group rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      aria-hidden
                      className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    <span
                      className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-ink-2"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block text-lg font-semibold tracking-tight text-ink">
                        <span className="sr-only">Topic {i + 1}: </span>
                        {t.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                        <Badge tone="brand">{t.code}</Badge>
                        <span className="flex items-center gap-2">
                          Exam weight {weightLabel(t.weightMin, t.weightMax)}
                          <span
                            aria-hidden
                            className="relative inline-block h-1.5 w-20 rounded-full bg-[var(--meter-track)]"
                          >
                            <span
                              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[var(--meter-from)] to-[var(--meter-to)]"
                              style={{
                                left: `${(t.weightMin / 20) * 100}%`,
                                width: `${((t.weightMax - t.weightMin) / 20) * 100}%`,
                              }}
                            />
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge>{plural(t.studyWeeks, "week")}</Badge>
                      <Badge>{plural(t.modules.length, "module")}</Badge>
                      <Badge
                        tone={empty === t.modules.length ? "warn" : "neutral"}
                      >
                        {plural(t.questionCount, "question")}
                      </Badge>
                    </span>
                  </summary>
                  <div className="border-t border-border p-3 sm:p-4">
                    <TableWrap label={`${t.name} modules`}>
                      <table className="w-full">
                        <caption className="sr-only">
                          Modules in {t.name}
                        </caption>
                        <thead className="border-b border-border">
                          <tr>
                            <th scope="col" className={`${th} w-16`}>
                              No.
                            </th>
                            <th scope="col" className={th}>
                              Module
                            </th>
                            <th scope="col" className={th}>
                              Slug
                            </th>
                            <th scope="col" className={`${th} text-right`}>
                              Questions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {t.modules.map((m) => (
                            <tr key={m.id}>
                              <td className={`${td} tabular text-ink-2`}>
                                {m.number}
                              </td>
                              <th
                                scope="row"
                                className={`${td} min-w-56 text-left font-medium`}
                              >
                                {m.title}
                              </th>
                              <td
                                className={`${td} whitespace-nowrap font-mono text-xs text-ink-2`}
                              >
                                {m.slug}
                              </td>
                              <td className={`${td} tabular text-right`}>
                                {m.questionCount === 0 ? (
                                  <span className="text-ink-2">None</span>
                                ) : (
                                  m.questionCount
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
