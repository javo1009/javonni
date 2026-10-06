"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { gradeHomework } from "@/app/actions/teacher";
import { Badge, Button, Card, CardBody, CardHeader, Eyebrow, Input, ProgressBar, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { FeedbackFiles } from "./feedback-files";
import { Spinner } from "./file-drop";
import { downloadUrl, formatBytes, isImageName } from "./file-rules";

export type MarkItem = {
  id: string;
  kind: "mcq" | "text" | "file";
  points: number;
  prompt: string;
  files: { id: string; name: string; size: number }[];
  textAnswer: string | null;
  chosenKey: string | null;
  options: { key: string; text: string }[] | null;
  correctKey: string | null;
  correct: boolean | null;
  pointsAwarded: number | null;
  feedback: string | null;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function MarkingForm({
  submissionId,
  assignmentId,
  items,
  graded,
  initialFeedback,
  feedbackFiles,
  nextHref,
  nextName,
}: {
  submissionId: string;
  assignmentId: string;
  items: MarkItem[];
  graded: boolean;
  initialFeedback: string;
  feedbackFiles: { id: string; name: string; size: number }[];
  /** The next unmarked submission, if any. */
  nextHref: string | null;
  nextName: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const marked = items.filter((i) => i.kind !== "mcq");
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(marked.map((i) => [i.id, i.pointsAwarded === null ? "" : fmt(i.pointsAwarded)])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(marked.map((i) => [i.id, i.feedback ?? ""])));
  const [overall, setOverall] = useState(initialFeedback);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const problem = (i: MarkItem) => {
    const raw = marks[i.id]?.trim() ?? "";
    if (raw === "") return `Enter points from 0 to ${i.points}.`;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > i.points) return `Points must be between 0 and ${i.points}.`;
    return null;
  };
  const mcqScore = items.filter((i) => i.kind === "mcq").reduce((s, i) => s + (i.pointsAwarded ?? 0), 0);
  const entered = marked.reduce((s, i) => s + (problem(i) ? 0 : Number(marks[i.id])), 0);
  const total = items.reduce((s, i) => s + i.points, 0);
  const score = mcqScore + entered;
  const unmarked = marked.filter((i) => problem(i)).length;

  function submit() {
    setServerError(null);
    setShowErrors(true);
    if (unmarked > 0) {
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }
    start(async () => {
      const r = await gradeHomework(submissionId, {
        items: marked.map((i) => ({ itemId: i.id, points: Number(marks[i.id]), feedback: notes[i.id]?.trim() || undefined })),
        feedback: overall.trim() || undefined,
      });
      if (!r.ok) return setServerError(r.error);
      setDone(true);
      router.push(`${nextHref ?? `/teacher/homework/${assignmentId}`}?returned=1`);
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        // Enter in a points box moves on rather than returning the work by accident.
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !pending) {
          e.preventDefault();
          submit();
        }
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start"
    >
      <ol className="min-w-0 space-y-4">
        {items.map((it, n) => {
          const err = it.kind !== "mcq" && showErrors ? problem(it) : null;
          return (
            <li key={it.id}>
              <Card aria-labelledby={`${uid}-${it.id}-h`}>
                <CardBody className="space-y-4 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-sm font-bold text-ink-2">{n + 1}.</span>
                    <Badge tone={it.kind === "file" ? "brand" : it.kind === "text" ? "neutral" : "good"}>
                      {it.kind === "file" ? "File upload" : it.kind === "text" ? "Written answer" : "Auto-marked"}
                    </Badge>
                    <span className="text-sm text-ink-2">{plural(it.points, "point")}</span>
                  </div>
                  <h3 id={`${uid}-${it.id}-h`} className="whitespace-pre-wrap font-medium text-ink">
                    {it.prompt}
                  </h3>

                  {it.kind === "file" && (
                    <div className="space-y-3">
                      {it.files.length === 0 ? (
                        <p className="text-sm text-ink-2">No files uploaded.</p>
                      ) : (
                        <ul className="space-y-3" aria-label="Student's uploaded files">
                          {it.files.map((f) => (
                            <li key={f.id} className="rounded-xl border border-border bg-surface-2 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <a href={downloadUrl(f.id)} className="min-w-0 break-all font-medium text-link underline-offset-2 hover:underline">
                                  {f.name}
                                </a>
                                <span className="flex items-center gap-3 text-sm text-ink-2">
                                  {formatBytes(f.size)}
                                  <a href={downloadUrl(f.id)} download className="inline-flex h-8 items-center rounded-[10px] border border-border-strong bg-surface-3 px-3 font-semibold text-ink hover:bg-surface-2 max-sm:h-11">
                                    Download
                                  </a>
                                </span>
                              </div>
                              {isImageName(f.name) && (
                                // Same authorized URL as the download link; a plain img so no optimizer proxies the bytes.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={downloadUrl(f.id)} alt={`Preview of ${f.name}`} loading="lazy" className="mt-3 max-h-96 max-w-full rounded-lg border border-border bg-surface object-contain" />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {it.kind === "text" && (
                    <blockquote className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-4 text-ink">
                      {it.textAnswer ?? <span className="text-ink-2">No answer given.</span>}
                    </blockquote>
                  )}

                  {it.kind === "mcq" && it.options && (
                    <div className="space-y-2">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {it.chosenKey === null ? (
                          <span className="text-ink-2">○ No answer</span>
                        ) : it.correct ? (
                          <span className="text-good">✓ Correct</span>
                        ) : (
                          <span className="text-risk">✗ Incorrect</span>
                        )}
                        <span className="font-normal text-ink-2">
                          {fmt(it.pointsAwarded ?? 0)} / {it.points} points (automatic)
                        </span>
                      </p>
                      <ul className="space-y-1">
                        {it.options.map((o) => (
                          <li
                            key={o.key}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-sm",
                              o.key === it.correctKey ? "border-good/50 bg-good-soft text-good" : o.key === it.chosenKey ? "border-risk/40 bg-risk-soft text-risk" : "border-border text-ink-2",
                            )}
                          >
                            {o.key}. {o.text}
                            {o.key === it.correctKey && <span className="font-semibold"> (correct)</span>}
                            {o.key === it.chosenKey && <span className="font-semibold"> (chosen)</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {it.kind !== "mcq" && (
                    <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                      <div className="space-y-1.5">
                        <label htmlFor={`${uid}-${it.id}-pts`} className="block text-sm font-medium text-ink">
                          Points
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`${uid}-${it.id}-pts`}
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min={0}
                            max={it.points}
                            value={marks[it.id]}
                            className="w-20"
                            aria-invalid={!!err}
                            aria-describedby={err ? `${uid}-${it.id}-err` : undefined}
                            onChange={(e) => setMarks((m) => ({ ...m, [it.id]: e.target.value }))}
                          />
                          <span className="tabular text-ink-2">/ {it.points}</span>
                        </div>
                        <button
                          type="button"
                          className="py-1 text-sm font-semibold text-link hover:underline max-sm:py-2.5"
                          onClick={() => setMarks((m) => ({ ...m, [it.id]: String(it.points) }))}
                        >
                          Full marks
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`${uid}-${it.id}-fb`} className="block text-sm font-medium text-ink">
                          Feedback on this item <span className="font-normal text-ink-2">(optional)</span>
                        </label>
                        <Textarea
                          id={`${uid}-${it.id}-fb`}
                          rows={2}
                          maxLength={2000}
                          className="min-h-0"
                          value={notes[it.id]}
                          onChange={(e) => setNotes((m) => ({ ...m, [it.id]: e.target.value }))}
                        />
                      </div>
                      {err && (
                        <p id={`${uid}-${it.id}-err`} role="alert" className="text-sm text-risk sm:col-span-2">
                          {err}
                        </p>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>

      <aside aria-label="Marking summary" className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardBody className="space-y-4 pt-5">
            <div>
              <Eyebrow>{graded ? "Marked · you can still edit" : "Score so far"}</Eyebrow>
              <p className="mt-1 text-4xl font-bold tracking-[-0.05em] text-ink">
                <span className="tabular">{fmt(score)}</span> <span className="text-xl font-semibold text-ink-2">/ {total}</span>
              </p>
              <p className="mb-2 text-sm text-ink-2">{total ? Math.round((score / total) * 100) : 0}%{unmarked > 0 ? ` · ${plural(unmarked, "item")} still to mark` : " · everything marked"}</p>
              <ProgressBar value={score} max={Math.max(total, 1)} label="Score" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-overall`} className="block text-sm font-medium text-ink">
                Overall feedback <span className="font-normal text-ink-2">(optional)</span>
              </label>
              <Textarea id={`${uid}-overall`} rows={4} maxLength={4000} value={overall} onChange={(e) => setOverall(e.target.value)} placeholder="What went well, what to work on next…" />
            </div>
            {showErrors && unmarked > 0 && (
              <p role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
                Mark every written answer and uploaded file before returning the work ({plural(unmarked, "item")} left).
              </p>
            )}
            {serverError && (
              <p role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending || done} aria-busy={pending}>
              {pending ? (
                <>
                  <Spinner className="border-brand-ink border-t-transparent" /> Returning…
                </>
              ) : graded ? (
                "Update and return"
              ) : (
                "Return graded work"
              )}
            </Button>
            <p className="text-xs text-ink-3">
              {nextHref ? `Then opens ${nextName ?? "the next submission"}.` : "Then returns to the class list."} Tip: Ctrl or ⌘ + Enter returns the work from any field.
            </p>
          </CardBody>
        </Card>
        <Card aria-labelledby={`${uid}-ff`}>
          <CardHeader id={`${uid}-ff`} title="Feedback files" subtitle="Marked-up copies for the student." />
          <CardBody>
            <FeedbackFiles submissionId={submissionId} files={feedbackFiles} graded={graded} />
          </CardBody>
        </Card>
      </aside>
    </form>
  );
}
