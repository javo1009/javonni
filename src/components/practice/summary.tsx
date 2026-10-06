"use client";

import Link from "next/link";
import { Check, RotateCcw, X } from "lucide-react";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  highlightPanel,
  ProgressBar,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMinutes, plural } from "@/lib/format";
import { summarize } from "./logic";
import type { SessionResult } from "./session";

export function PracticeSummary({
  result,
  label,
  durationMs,
  onAgain,
  onNew,
}: {
  result: SessionResult;
  label: string;
  durationMs: number;
  onAgain: () => void;
  onNew: () => void;
}) {
  const s = summarize(result.outcomes);
  const missed = result.reviews.filter((r) => r.reveal && !r.reveal.correct);
  const mins = Math.max(1, Math.round(durationMs / 60_000));

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-6">
      <section
        aria-label="Session score"
        className={cn(
          "rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow)] sm:p-6",
          highlightPanel,
        )}
      >
        <p className="text-sm font-semibold text-ink-2">{label}</p>
        {s.answered === 0 ? (
          <>
            <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
              No questions answered
            </p>
            <p className="mt-1 text-ink-2">
              Nothing was recorded this time.{" "}
              {s.skipped > 0
                ? `You skipped ${plural(s.skipped, "question")}.`
                : ""}
            </p>
          </>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
              <p className="tabular text-5xl font-bold leading-none tracking-[-0.05em] text-ink">
                {s.correct}
                <span className="text-2xl font-semibold text-ink-2">
                  {" "}
                  / {s.answered}
                </span>
              </p>
              <p className="tabular text-3xl font-bold tracking-[-0.04em] text-ink">
                {s.pct}%
              </p>
            </div>
            <ProgressBar
              value={s.pct ?? 0}
              max={100}
              label={`Score ${s.pct}%`}
              className="mt-4"
            />
          </>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink-2">Correct</dt>
            <dd className="tabular text-lg font-bold text-ink">{s.correct}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Incorrect</dt>
            <dd className="tabular text-lg font-bold text-ink">{s.wrong}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Skipped</dt>
            <dd className="tabular text-lg font-bold text-ink">{s.skipped}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Time</dt>
            <dd className="tabular text-lg font-bold text-ink">
              {formatMinutes(mins)}
            </dd>
          </div>
        </dl>
      </section>

      {s.weakest && (
        <section
          aria-label="Weakest chapter"
          className="rounded-[var(--radius-card)] border border-warn/40 bg-warn-soft p-5"
        >
          <p className="text-sm font-semibold text-warn">
            Weakest chapter this session
          </p>
          <p className="mt-1 text-lg font-semibold leading-snug text-ink">
            {s.weakest.title}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">
            {s.weakest.correct} of {s.weakest.answered} correct ({s.weakest.pct}
            %)
          </p>
          <Link
            href={`/student/practice?module=${s.weakest.moduleId}`}
            className={buttonClass("primary", "md", "mt-3")}
          >
            <RotateCcw aria-hidden className="size-4" /> Practise this chapter
            again
          </Link>
        </section>
      )}

      {s.byModule.length > 0 && (
        <Card aria-labelledby="by-chapter">
          <CardHeader id="by-chapter" title="Results by chapter" />
          <CardBody>
            <TableWrap label="Results by chapter">
              <table className="w-full min-w-[30rem]">
                <thead>
                  <tr>
                    <th className={th}>Chapter</th>
                    <th className={cn(th, "text-right")}>Correct</th>
                    <th className={cn(th, "w-40")}>Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.byModule.map((m) => (
                    <tr key={m.moduleId}>
                      <td className={td}>
                        <Link
                          href={`/student/practice?module=${m.moduleId}`}
                          className="font-medium text-link hover:underline"
                        >
                          {m.title}
                        </Link>
                      </td>
                      <td className={cn(td, "tabular text-right")}>
                        {m.correct} / {m.answered}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={m.pct}
                            max={100}
                            label={`${m.title}: ${m.pct}%`}
                            className="flex-1"
                          />
                          <span className="tabular w-10 text-right text-sm font-semibold">
                            {m.pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      )}

      {missed.length > 0 && (
        <Card aria-labelledby="review-title">
          <CardHeader
            id="review-title"
            title="Review what you missed"
            subtitle={plural(missed.length, "question")}
          />
          <CardBody className="space-y-2">
            {missed.map((r) => {
              const mine = r.question.options.find(
                (o) => o.key === r.chosenKey,
              );
              const right = r.question.options.find(
                (o) => o.key === r.reveal?.correctKey,
              );
              return (
                <details
                  key={r.question.id}
                  className="rounded-xl border border-border bg-surface-2 px-4 py-2.5"
                >
                  <summary className="flex min-h-9 cursor-pointer items-start gap-2 py-1 font-medium text-ink max-sm:min-h-11">
                    <Badge tone="risk" className="mt-0.5 shrink-0">
                      <X aria-hidden className="size-3.5" /> Missed
                    </Badge>
                    <span className="min-w-0">{r.question.stem}</span>
                  </summary>
                  <div className="space-y-2 pb-2 pt-2 text-sm">
                    <p className="text-ink-2">
                      <span className="font-semibold text-ink">
                        Your answer:
                      </span>{" "}
                      {mine ? `${mine.key}. ${mine.text}` : "none"}
                    </p>
                    <p className="flex items-start gap-1.5 text-ink-2">
                      <Check
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-good"
                      />
                      <span>
                        <span className="font-semibold text-ink">
                          Correct answer:
                        </span>{" "}
                        {right
                          ? `${right.key}. ${right.text}`
                          : r.reveal?.correctKey}
                      </span>
                    </p>
                    {r.reveal?.explanation && (
                      <p className="whitespace-pre-wrap text-ink-2">
                        {r.reveal.explanation}
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onAgain} className="max-sm:w-full">
          <RotateCcw aria-hidden className="size-4" /> Practise again
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={onNew}
          className="max-sm:w-full"
        >
          Choose something else
        </Button>
        <Link
          href="/student/chapters"
          className={buttonClass("ghost", "lg", "max-sm:w-full")}
        >
          All chapters
        </Link>
      </div>
    </div>
  );
}
