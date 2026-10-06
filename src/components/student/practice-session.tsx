"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { answerPracticeQuestion, loadPracticeQuestions } from "@/app/actions/student";
import { Badge, buttonClass, EmptyState, ProgressBar } from "@/components/ui";
import { LOS_STATUS_LABEL, type LosStatus } from "@/domain/status";
import { cn } from "@/lib/cn";
import type { AnswerResult, PracticeQuestion } from "@/services/practice";

export type SessionScope = { kind: "mixed" } | { kind: "review" } | { kind: "topic" | "module" | "los"; id: string };

type Answered = { q: PracticeQuestion; chosen: string; result: AnswerResult };
type Load = { ok: true; data: PracticeQuestion[] } | { ok: false; error: string } | null;

const STATUS_TONE: Record<LosStatus, "neutral" | "brand" | "good" | "warn"> = {
  not_started: "neutral",
  studied: "neutral",
  practiced: "brand",
  proficient: "good",
  review_due: "warn",
};

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t.tagName === "INPUT" && !["radio", "checkbox"].includes((t as HTMLInputElement).type);
}

export function PracticeSession({ scope, count, fallbackHref }: { scope: SessionScope; count: number; fallbackHref: string | null }) {
  const scopeKind = scope.kind;
  const scopeId = "id" in scope ? scope.id : undefined;
  const [round, setRound] = useState(0);
  const [load, setLoad] = useState<Load>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [current, setCurrent] = useState<AnswerResult | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const s = scopeId ? ({ kind: scopeKind, id: scopeId } as SessionScope) : ({ kind: scopeKind } as SessionScope);
    loadPracticeQuestions(s, count).then((r) => {
      if (cancelled) return;
      setLoad(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error });
      shownAt.current = Date.now();
    });
    return () => {
      cancelled = true;
    };
  }, [scopeKind, scopeId, count, round]);

  const questions = load?.ok ? load.data : [];
  const q = questions[index] as PracticeQuestion | undefined;

  const submit = useCallback(async () => {
    if (!q || !selected || current || submitting) return;
    setSubmitting(true);
    setError(null);
    const r = await answerPracticeQuestion({ questionId: q.id, chosenKey: selected, timeMs: Math.min(3_600_000, Date.now() - shownAt.current) });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setCurrent(r.data);
    setShowExplanation(true);
    setAnswered((a) => [...a, { q, chosen: selected, result: r.data }]);
    requestAnimationFrame(() => nextRef.current?.focus());
  }, [q, selected, current, submitting]);

  const next = useCallback(() => {
    if (!current) return;
    if (index + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setCurrent(null);
    setError(null);
    shownAt.current = Date.now();
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [current, index, questions.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || !q || finished) return;
      const k = e.key.toLowerCase();
      if (!current && k.length === 1) {
        const opt = q.options.find((o) => o.key.toLowerCase() === k);
        if (opt) {
          e.preventDefault();
          setSelected(opt.key);
          return;
        }
      }
      if (e.key === "Enter") {
        // Let focused buttons and links handle Enter themselves.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault();
        if (current) next();
        else void submit();
      } else if (k === "n" && current) {
        e.preventDefault();
        next();
      } else if (k === "e" && current) {
        e.preventDefault();
        setShowExplanation((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, current, finished, next, submit]);

  const restart = () => {
    setLoad(null);
    setIndex(0);
    setSelected(null);
    setCurrent(null);
    setAnswered([]);
    setFinished(false);
    setError(null);
    setRound((r) => r + 1);
  };

  // ------------------------------------------------------------ states
  if (load === null) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <span className="sr-only">Loading questions…</span>
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    );
  }

  if (!load.ok || questions.length === 0) {
    return (
      <EmptyState
        title="No questions here yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {fallbackHref && (
              <Link href={fallbackHref} className={buttonClass("primary")}>
                Practise the wider module
              </Link>
            )}
            <Link href="/student/practice" className={buttonClass("secondary")}>
              Choose another set
            </Link>
          </div>
        }
      >
        {load.ok ? "There are no questions for this set yet." : load.error} Some objectives don&apos;t have questions yet; your teacher or admin can add them.
      </EmptyState>
    );
  }

  if (finished) return <Summary answered={answered} onRestart={restart} />;
  if (!q) return null;

  const correctKey = current?.correctKey;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <p className="tabular shrink-0 text-sm text-ink-2">
          Question {index + 1} of {questions.length}
        </p>
        <ProgressBar value={index + (current ? 1 : 0)} max={questions.length} label={`Question ${index + 1} of ${questions.length}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="q-stem" className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <span className="tabular font-medium">{q.losCode}</span>
            <span>·</span>
            <span>{q.topicName}</span>
            <span>·</span>
            <span>{q.difficulty === 1 ? "Easy" : q.difficulty === 3 ? "Hard" : "Medium"}</span>
          </p>
          <h2 id="q-stem" ref={headingRef} tabIndex={-1} className="text-lg leading-relaxed text-ink outline-none">
            {q.stem}
          </h2>
        </section>

        <div className="space-y-3">
          <fieldset disabled={!!current || submitting}>
            <legend className="sr-only">Choose an answer</legend>
            <div className="space-y-2">
              {q.options.map((o) => {
                const isChosen = selected === o.key;
                const isCorrect = correctKey === o.key;
                const isWrongChoice = !!current && isChosen && !isCorrect;
                return (
                  <label
                    key={o.key}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                      !current && (isChosen ? "border-brand bg-brand-soft" : "border-border-strong hover:bg-surface-2"),
                      current && isCorrect && "border-good bg-good-soft",
                      isWrongChoice && "border-risk bg-risk-soft",
                      current && !isCorrect && !isWrongChoice && "border-border opacity-70",
                      (current || submitting) && "cursor-default",
                    )}
                  >
                    <input type="radio" name={`q-${q.id}`} value={o.key} checked={isChosen} onChange={() => setSelected(o.key)} className="sr-only" />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md border text-sm font-semibold",
                        isChosen && !current ? "border-brand bg-brand text-brand-ink" : "border-border-strong text-ink-2",
                        current && isCorrect && "border-good bg-good text-surface",
                        isWrongChoice && "border-risk bg-risk text-surface",
                      )}
                    >
                      {current && isCorrect ? <Check className="size-4" strokeWidth={3} /> : isWrongChoice ? <X className="size-4" strokeWidth={3} /> : o.key}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 text-ink">
                      <span className="sr-only">{o.key}. </span>
                      {o.text}
                      {current && isCorrect && <span className="ml-2 text-sm font-medium text-good">Correct answer</span>}
                      {isWrongChoice && <span className="ml-2 text-sm font-medium text-risk">Your answer</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-risk">
              {error}
            </p>
          )}

          <div aria-live="polite">
            {current && (
              <div className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <p className={cn("flex items-center gap-2 font-semibold", current.correct ? "text-good" : "text-risk")}>
                  {current.correct ? <Check className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
                  {current.correct ? "Correct" : `Not quite. The answer is ${current.correctKey}.`}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  <span className="tabular font-medium text-ink">{current.losCode}</span> is now
                  <Badge tone={STATUS_TONE[current.status]}>{LOS_STATUS_LABEL[current.status]}</Badge>
                  <span className="tabular">mastery {Math.round(current.mastery * 100)}%</span>
                </p>
                {showExplanation && <p className="text-sm leading-relaxed text-ink">{current.explanation}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!current ? (
              <button type="button" onClick={() => void submit()} disabled={!selected || submitting} aria-busy={submitting} className={buttonClass("primary", "lg")}>
                {submitting ? "Checking…" : "Check answer"}
                <kbd className="hidden rounded border border-brand-ink/30 px-1.5 text-xs font-normal sm:inline">Enter</kbd>
              </button>
            ) : (
              <>
                <button ref={nextRef} type="button" onClick={next} className={buttonClass("primary", "lg")}>
                  {index + 1 >= questions.length ? "See summary" : "Next question"}
                  <kbd className="hidden rounded border border-brand-ink/30 px-1.5 text-xs font-normal sm:inline">N</kbd>
                </button>
                <button type="button" onClick={() => setShowExplanation((s) => !s)} aria-pressed={showExplanation} className={buttonClass("ghost", "lg")}>
                  {showExplanation ? "Hide explanation" : "Show explanation"}
                  <kbd className="hidden rounded border border-border-strong px-1.5 text-xs font-normal sm:inline">E</kbd>
                </button>
              </>
            )}
          </div>
          <p className="hidden text-xs text-ink-3 sm:block">Keys: {q.options.map((o) => o.key).join(" / ")} choose · Enter check · N next · E explanation</p>
        </div>
      </div>
    </div>
  );
}

function Summary({ answered, onRestart }: { answered: Answered[]; onRestart: () => void }) {
  const correct = answered.filter((a) => a.result.correct).length;
  const byLos = new Map<string, { code: string; right: number; total: number; status: LosStatus; mastery: number }>();
  for (const a of answered) {
    const r = byLos.get(a.result.losId) ?? { code: a.result.losCode, right: 0, total: 0, status: a.result.status, mastery: a.result.mastery };
    r.total++;
    if (a.result.correct) r.right++;
    r.status = a.result.status;
    r.mastery = a.result.mastery;
    byLos.set(a.result.losId, r);
  }
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="font-[family-name:var(--font-display)] text-3xl text-ink outline-none">
          <span className="tabular">
            {correct} of {answered.length}
          </span>{" "}
          correct
        </h2>
        <p className="mt-1 text-ink-2">
          {correct === answered.length ? "A clean set. Nicely done." : "Each answer has already updated your map. Mistakes are where the learning is."}
        </p>
      </section>
      <section aria-labelledby="sum-los-h" className="rounded-[var(--radius-card)] border border-border bg-surface">
        <h3 id="sum-los-h" className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          Objectives in this set
        </h3>
        <ul className="divide-y divide-border">
          {[...byLos].map(([id, r]) => (
            <li key={id}>
              <Link href={`/student/map/${id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 hover:bg-surface-2">
                <span className="tabular font-medium text-brand">{r.code}</span>
                <span className="tabular text-sm text-ink-2">
                  {r.right}/{r.total} correct
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>{LOS_STATUS_LABEL[r.status]}</Badge>
                  <span className="tabular text-sm text-ink-2">{Math.round(r.mastery * 100)}%</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onRestart} className={buttonClass("primary", "lg")}>
          Another set
        </button>
        <Link href="/student/practice" className={buttonClass("secondary", "lg")}>
          Choose a different set
        </Link>
        <Link href="/student" className={buttonClass("ghost", "lg")}>
          Back to today
        </Link>
      </div>
    </div>
  );
}
