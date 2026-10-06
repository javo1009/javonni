"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { gradeSubmissionAction } from "@/app/actions/teacher";
import { Badge, Banner, Button, Card, CardBody, FormError, Input, Textarea, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export type GradeItem = {
  itemId: string;
  kind: "mcq" | "text";
  maxPoints: number;
  text: string;
  options: { key: string; text: string }[] | null;
  correctKey: string | null;
  chosenKey: string | null;
  textAnswer: string | null;
  pointsAwarded: number | null;
  feedback: string;
};

type QueueEntry = { submissionId: string; name: string; status: "submitted" | "graded"; late: boolean };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function GradingForm({
  submissionId,
  assignmentId,
  status,
  items,
  overallFeedback,
  score,
  maxScore,
  queue,
}: {
  submissionId: string;
  assignmentId: string;
  status: "in_progress" | "submitted" | "graded";
  items: GradeItem[];
  overallFeedback: string;
  score: number | null;
  maxScore: number | null;
  queue: QueueEntry[];
}) {
  const router = useRouter();
  const uid = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.filter((i) => i.kind === "text").map((i) => [i.itemId, i.pointsAwarded === null ? "" : String(i.pointsAwarded)])),
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.itemId, i.feedback])));
  const [overall, setOverall] = useState(overallFeedback);
  const [openFb, setOpenFb] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ score: number | null; maxScore: number | null } | null>(null);
  const [pending, start] = useTransition();

  const idx = queue.findIndex((q) => q.submissionId === submissionId);
  const prev = idx > 0 ? queue[idx - 1] : null;
  const next = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : null;
  const nextUngraded = [...queue.slice(idx + 1), ...queue.slice(0, Math.max(0, idx))].find((q) => q.status === "submitted" && q.submissionId !== submissionId);
  const href = (id: string) => `/teacher/homework/${assignmentId}/submissions/${id}`;
  const readOnly = status === "in_progress";

  const mcqPoints = items.filter((i) => i.kind === "mcq").reduce((s, i) => s + (i.pointsAwarded ?? 0), 0);
  const textPoints = items.filter((i) => i.kind === "text").reduce((s, i) => s + (Number(points[i.itemId]) || 0), 0);
  const max = items.reduce((s, i) => s + i.maxPoints, 0);

  // J/K move through the queue when the teacher isn't typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && next) router.push(href(next.submissionId));
      if (e.key === "k" && prev) router.push(href(prev.submissionId));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function save() {
    setError(null);
    const payload: { itemId: string; points: number; feedback?: string }[] = [];
    for (const it of items) {
      const fb = feedback[it.itemId]?.trim() ?? "";
      if (it.kind === "text") {
        const raw = points[it.itemId];
        const n = Number(raw);
        if (raw === "" || raw === undefined || Number.isNaN(n)) {
          setError("Enter points for every written answer.");
          document.getElementById(`${uid}-${it.itemId}-pts`)?.focus();
          return;
        }
        if (n < 0 || n > it.maxPoints) {
          setError(`Points must be between 0 and ${it.maxPoints}.`);
          document.getElementById(`${uid}-${it.itemId}-pts`)?.focus();
          return;
        }
        payload.push({ itemId: it.itemId, points: n, feedback: fb });
      } else if (fb !== it.feedback.trim()) {
        // Multiple-choice points stay as auto-graded; send the item only to store feedback.
        payload.push({ itemId: it.itemId, points: it.pointsAwarded ?? 0, feedback: fb });
      }
    }
    start(async () => {
      const res = await gradeSubmissionAction({ submissionId, items: payload, feedback: overall });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(res.data);
      requestAnimationFrame(() => resultRef.current?.focus());
    });
  }

  return (
    <form
      className="min-w-0 space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (!readOnly && !pending) save();
        }
      }}
    >
      {readOnly && (
        <Banner tone="neutral" title="Not submitted yet">
          The student is still working on this. You can grade it once they submit.
        </Banner>
      )}
      {saved && (
        <div ref={resultRef} tabIndex={-1} role="status" className="rounded-lg border border-good/40 bg-good-soft px-4 py-3 text-sm text-good outline-none">
          <p className="font-semibold">
            Grades saved and returned to the student.
            {saved.score !== null && saved.maxScore ? ` Score ${fmt(saved.score)} / ${fmt(saved.maxScore)} (${Math.round((saved.score / saved.maxScore) * 100)}%).` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {nextUngraded ? (
              <Link href={href(nextUngraded.submissionId)} className={buttonClass("primary", "sm")}>
                Next to grade: {nextUngraded.name}
              </Link>
            ) : (
              <span className="text-ink">Nothing else waiting for grading on this homework.</span>
            )}
            <Link href={`/teacher/homework/${assignmentId}`} className={buttonClass("secondary", "sm")}>
              Back to homework
            </Link>
          </div>
        </div>
      )}

      <ol className="space-y-4">
        {items.map((it, i) => {
          const fbId = `${uid}-${it.itemId}-fb`;
          return (
            <li key={it.itemId}>
              <Card>
                <CardBody className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      <span className="mr-2 font-semibold text-ink-2">Q{i + 1}</span>
                      {it.text}
                    </p>
                    <Badge>{it.kind === "mcq" ? "Multiple choice · auto-graded" : "Written"}</Badge>
                  </div>

                  {it.kind === "mcq" && it.options && (
                    <>
                      <ul className="space-y-1" aria-label="Options">
                        {it.options.map((o) => {
                          const chosen = o.key === it.chosenKey;
                          const correct = o.key === it.correctKey;
                          return (
                            <li
                              key={o.key}
                              className={cn(
                                "flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm",
                                correct ? "border-good/40 bg-good-soft" : chosen ? "border-risk/40 bg-risk-soft" : "border-transparent",
                              )}
                            >
                              <span className="font-semibold text-ink">{o.key}.</span>
                              <span className="min-w-0 flex-1 text-ink">{o.text}</span>
                              {chosen && <span className={cn("shrink-0 text-xs font-semibold", correct ? "text-good" : "text-risk")}>{correct ? "✓ Chosen, correct" : "✗ Chosen"}</span>}
                              {correct && !chosen && <span className="shrink-0 text-xs font-semibold text-good">✓ Correct answer</span>}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="tabular text-sm text-ink-2">
                        {it.chosenKey ? "" : "No answer given · "}
                        {fmt(it.pointsAwarded ?? 0)} / {it.maxPoints} pt
                      </p>
                    </>
                  )}

                  {it.kind === "text" && (
                    <>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Student&apos;s answer</p>
                        <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-brand bg-surface-2 px-3 py-2 text-sm text-ink">
                          {it.textAnswer || <span className="italic text-ink-2">No answer given.</span>}
                        </blockquote>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={`${uid}-${it.itemId}-pts`} className="text-sm font-medium text-ink">
                          Points
                        </label>
                        <Input
                          id={`${uid}-${it.itemId}-pts`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={it.maxPoints}
                          step={0.5}
                          required
                          disabled={readOnly}
                          value={points[it.itemId] ?? ""}
                          onChange={(e) => setPoints((p) => ({ ...p, [it.itemId]: e.target.value }))}
                          className="w-24!"
                          aria-describedby={`${uid}-${it.itemId}-max`}
                        />
                        <span id={`${uid}-${it.itemId}-max`} className="text-sm text-ink-2">
                          of {it.maxPoints}
                        </span>
                        <span className="ml-2 flex gap-1">
                          {[0, it.maxPoints / 2, it.maxPoints].map((v) => (
                            <button
                              key={v}
                              type="button"
                              disabled={readOnly}
                              onClick={() => setPoints((p) => ({ ...p, [it.itemId]: String(v) }))}
                              className="h-8 rounded-md border border-border px-2 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
                              aria-label={`Give ${fmt(v)} of ${it.maxPoints} points`}
                            >
                              {fmt(v)}
                            </button>
                          ))}
                        </span>
                      </div>
                    </>
                  )}

                  {it.kind === "mcq" && !it.feedback && !openFb.includes(it.itemId) ? (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setOpenFb((o) => [...o, it.itemId]);
                        requestAnimationFrame(() => document.getElementById(fbId)?.focus());
                      }}
                      className="text-sm text-brand hover:underline disabled:opacity-50"
                    >
                      + Add feedback on Q{i + 1}
                    </button>
                  ) : (
                    <div className="space-y-1">
                      <label htmlFor={fbId} className="block text-sm font-medium text-ink">
                        Feedback on Q{i + 1} <span className="font-normal text-ink-2">(optional)</span>
                      </label>
                      <Textarea
                        id={fbId}
                        rows={2}
                        maxLength={2000}
                        disabled={readOnly}
                        value={feedback[it.itemId] ?? ""}
                        onChange={(e) => setFeedback((f) => ({ ...f, [it.itemId]: e.target.value }))}
                        className="min-h-16! text-sm"
                      />
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardBody className="space-y-3 pt-4">
          <div className="space-y-1">
            <label htmlFor={`${uid}-overall`} className="block text-sm font-medium text-ink">
              Overall feedback <span className="font-normal text-ink-2">(optional, shown with the score)</span>
            </label>
            <Textarea id={`${uid}-overall`} rows={3} maxLength={4000} disabled={readOnly} value={overall} onChange={(e) => setOverall(e.target.value)} />
          </div>
          <FormError message={error ?? undefined} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="tabular text-sm text-ink-2">
              Total {fmt(mcqPoints + textPoints)} / {fmt(max)}
              {status === "graded" && score !== null && maxScore ? ` · last saved ${fmt(score)} / ${fmt(maxScore)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {prev && (
                <Link href={href(prev.submissionId)} className={buttonClass("ghost", "md")}>
                  ← {prev.name}
                </Link>
              )}
              {next && (
                <Link href={href(next.submissionId)} className={buttonClass("ghost", "md")}>
                  {next.name} →
                </Link>
              )}
              <Button type="submit" disabled={readOnly || pending} aria-busy={pending}>
                {pending ? "Saving…" : status === "graded" ? "Update grades" : "Save grades & return"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
