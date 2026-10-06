import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { QuestionImport } from "@/components/admin/question-import";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Metric,
  PageHeader,
  ProgressBar,
  StatusPill,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { plural } from "@/lib/format";
import { QUESTION_CSV } from "@/domain/question-csv";
import { adminContext } from "@/server/context";
import { adminCoverage, type CoverageStatus } from "@/services/admin";

export const metadata: Metadata = { title: "Question coverage" };

const STATUS: Record<
  CoverageStatus,
  { tone: "risk" | "warn" | "good"; label: string }
> = {
  none: { tone: "risk", label: "Needs questions" },
  low: { tone: "warn", label: "Needs more" },
  ok: { tone: "good", label: "Covered" },
};

const COLUMNS: { name: string; required: string; note: string }[] = [
  {
    name: "module",
    required: "Yes",
    note: "A module slug (quantitative-methods-04) or a topic code and number (QM 4). Codes: QM, FSA, ECO, CF, EQ, FI, DER, ALT, PC, ETH.",
  },
  {
    name: "stem",
    required: "Yes",
    note: `The question text, 10–${QUESTION_CSV.maxStem} characters.`,
  },
  {
    name: "a, b, c",
    required: "Yes",
    note: `The first three answer options, up to ${QUESTION_CSV.maxOption} characters each. They must differ.`,
  },
  {
    name: "d",
    required: "No",
    note: "A fourth option. Leave it blank for a three-option question, as on the exam.",
  },
  {
    name: "correct",
    required: "Yes",
    note: "A, B, C or D. It must point at a filled option.",
  },
  {
    name: "explanation",
    required: "Yes",
    note: "Why the answer is right. Students see it after they answer.",
  },
  { name: "difficulty", required: "Yes", note: "1 easy, 2 medium, 3 hard." },
  {
    name: "source",
    required: "No",
    note: `A note on where the question came from (up to ${QUESTION_CSV.maxSource} characters). It goes in the audit log, not onto the question.`,
  },
];

export default async function CoveragePage({
  searchParams,
}: PageProps<"/admin/coverage">) {
  const sp = await searchParams;
  const needsOnly = (Array.isArray(sp.needs) ? sp.needs[0] : sp.needs) === "1";
  const { actor, db } = await adminContext();
  const c = await adminCoverage(db, actor);

  const actions = (
    <>
      <ButtonLink
        href="/admin/coverage/template"
        variant="secondary"
        prefetch={false}
        download
      >
        Download CSV template
      </ButtonLink>
      <ButtonLink
        href="/admin/coverage/export"
        variant="secondary"
        prefetch={false}
        download
      >
        Export question bank
      </ButtonLink>
    </>
  );

  if (!c) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Question coverage" />
        <EmptyState title="No active curriculum">
          Run the deploy setup (npm run db:seed) before adding questions.
        </EmptyState>
      </>
    );
  }
  const { totals } = c;
  const [easy, medium, hard] = totals.byDifficulty;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Question coverage"
        description={`How many published questions each module has, and a way to add more. A module is flagged until it has ${c.min} or more.`}
        actions={actions}
      />

      <div className="grid grid-cols-1 gap-3.5 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <Metric
          primary
          label="Published questions"
          value={totals.published.toLocaleString()}
          hint={
            totals.bySource.map((s) => `${s.n} ${s.source}`).join(" · ") ||
            "None yet"
          }
        />
        <Metric
          label="Modules covered"
          value={`${totals.covered}`}
          unit={`of ${totals.modules}`}
          meter={totals.modules ? totals.covered / totals.modules : 0}
          hint={`${c.min}+ questions each`}
        />
        <Metric
          label="Need more questions"
          value={totals.low.toLocaleString()}
          hint="1 or 2 questions so far"
        />
        <Metric
          label="No questions yet"
          value={totals.none.toLocaleString()}
          hint={`By difficulty: ${easy} easy · ${medium} medium · ${hard} hard`}
        />
      </div>

      <Card className="mt-6 scroll-mt-4" id="import" aria-labelledby="import-h">
        <CardHeader
          id="import-h"
          title="Import questions from CSV"
          subtitle="Preview first: every row is checked and nothing is saved until you confirm. Imported questions are published straight away."
        />
        <CardBody className="space-y-5">
          <QuestionImport />
          <details className="rounded-lg border border-border bg-surface-2/40">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold text-ink">
              File format
            </summary>
            <div className="space-y-3 border-t border-border p-4 text-sm text-ink-2">
              <p>
                One question per row, with a header row. Save as{" "}
                <strong className="text-ink">CSV (UTF-8)</strong>; commas and
                line breaks inside a cell must sit within double quotes, which
                Excel and Sheets add for you.{" "}
                <Link
                  href="/admin/coverage/template"
                  prefetch={false}
                  className="font-semibold text-link underline-offset-2 hover:underline"
                >
                  Download the template
                </Link>{" "}
                (it has two example rows to delete).
              </p>
              <TableWrap label="CSV columns">
                <table className="w-full">
                  <caption className="sr-only">CSV columns</caption>
                  <thead className="border-b border-border">
                    <tr>
                      <th scope="col" className={th}>
                        Column
                      </th>
                      <th scope="col" className={th}>
                        Required
                      </th>
                      <th scope="col" className={th}>
                        What to put there
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {COLUMNS.map((col) => (
                      <tr key={col.name} className="align-top">
                        <th
                          scope="row"
                          className={`${td} whitespace-nowrap text-left font-mono text-xs`}
                        >
                          {col.name}
                        </th>
                        <td className={td}>{col.required}</td>
                        <td className={`${td} min-w-64 text-ink-2`}>
                          {col.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Rows whose stem already exists in the same module are skipped
                  as duplicates, so re-uploading a file is safe.
                </li>
                <li>
                  With the skip option unticked, one invalid row stops the whole
                  import.
                </li>
                <li>
                  Exports put an apostrophe before cells starting with = + - @
                  so spreadsheets never run them as formulas; the import removes
                  it again.
                </li>
                <li>
                  Use your own wording. Don&apos;t paste copyrighted exam
                  questions.
                </li>
              </ul>
            </div>
          </details>
        </CardBody>
      </Card>

      <section
        aria-labelledby="coverage-h"
        id="coverage"
        className="mt-8 scroll-mt-4"
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2
            id="coverage-h"
            className="text-xl font-semibold tracking-tight text-ink"
          >
            Coverage by topic
          </h2>
          <Link
            href={
              needsOnly
                ? "/admin/coverage#coverage"
                : "/admin/coverage?needs=1#coverage"
            }
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-2 hover:underline"
          >
            {needsOnly
              ? "Show every module"
              : `Show only modules that need questions (${totals.low + totals.none})`}
          </Link>
        </div>
        {c.unmapped > 0 && (
          <p className="mb-3 text-sm text-ink-2">
            {plural(c.unmapped, "published question")}{" "}
            {c.unmapped === 1 ? "isn't" : "aren't"} attached to a module of this
            curriculum, so {c.unmapped === 1 ? "it isn't" : "they aren't"}{" "}
            counted below.
          </p>
        )}
        <div className="space-y-3">
          {c.topics.map((t) => {
            const rows = needsOnly
              ? t.modules.filter((m) => m.status !== "ok")
              : t.modules;
            if (needsOnly && rows.length === 0) return null;
            const ready = t.modules.length - t.needing;
            return (
              <details
                key={t.id}
                open={needsOnly}
                className="group rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]"
              >
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden
                    className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  />
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block text-lg font-semibold tracking-tight text-ink">
                      {t.name}
                    </span>
                    <span className="text-sm text-ink-2">
                      {ready} of {t.modules.length} modules covered
                    </span>
                  </span>
                  <span className="flex w-full items-center gap-3 sm:w-64">
                    <ProgressBar
                      value={ready}
                      max={t.modules.length}
                      label={`${t.name}: modules covered`}
                      className="flex-1"
                    />
                  </span>
                  <Badge tone={t.needing === 0 ? "good" : "neutral"}>
                    {plural(t.total, "question")}
                  </Badge>
                </summary>
                <div className="border-t border-border p-3 sm:p-4">
                  <TableWrap label={`${t.name} question coverage`}>
                    <table className="w-full">
                      <caption className="sr-only">
                        Published questions per module in {t.name}
                      </caption>
                      <thead className="border-b border-border">
                        <tr>
                          <th scope="col" className={th}>
                            Module
                          </th>
                          <th scope="col" className={`${th} text-right`}>
                            Published
                          </th>
                          <th scope="col" className={`${th} text-right`}>
                            Easy
                          </th>
                          <th scope="col" className={`${th} text-right`}>
                            Medium
                          </th>
                          <th scope="col" className={`${th} text-right`}>
                            Hard
                          </th>
                          <th scope="col" className={th}>
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((m) => (
                          <tr key={m.id}>
                            <th
                              scope="row"
                              className={`${td} min-w-60 text-left font-normal`}
                            >
                              <span className="font-medium text-ink">
                                <span className="tabular text-ink-2">
                                  {m.number}.
                                </span>{" "}
                                {m.title}
                              </span>
                              <span className="block font-mono text-xs text-ink-2">
                                {m.slug}
                              </span>
                            </th>
                            <td
                              className={`${td} tabular text-right font-semibold`}
                            >
                              {m.total}
                            </td>
                            {m.byDifficulty.map((n, i) => (
                              <td
                                key={i}
                                className={`${td} tabular text-right ${n === 0 ? "text-ink-3" : ""}`}
                              >
                                {n}
                              </td>
                            ))}
                            <td className={td}>
                              <StatusPill
                                tone={STATUS[m.status].tone}
                                label={STATUS[m.status].label}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </>
  );
}
