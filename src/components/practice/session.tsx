"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Flag,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { answerPractice } from "@/app/actions/student";
import { Button, Card, FormError, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AnswerResult, PracticeQuestion } from "@/services/practice";
import {
  elapsedMs,
  formatClock,
  optionForKey,
  remainingMs,
  tallyText,
  TIMED_SECONDS_PER_QUESTION,
  type QuestionOutcome,
} from "./logic";

export type ReviewEntry = {
  question: PracticeQuestion;
  chosenKey: string | null;
  reveal: AnswerResult | null;
};
export type SessionResult = {
  outcomes: QuestionOutcome[];
  reviews: ReviewEntry[];
};

type Phase = "choosing" | "submitting" | "revealed";

export function PracticeSession({
  questions,
  timed,
  label,
  startedAt: firstStart,
  onAnswered,
  onDone,
}: {
  questions: PracticeQuestion[];
  timed: boolean;
  label: string;
  /** When the first question was shown (ms since epoch). */
  startedAt: number;
  onAnswered: () => void;
  onDone: (r: SessionResult) => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("choosing");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<AnswerResult | null>(null);
  const [outcomes, setOutcomes] = useState<QuestionOutcome[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [startedAt, setStartedAt] = useState(firstStart);
  const [now, setNow] = useState(firstStart);
  const [announce, setAnnounce] = useState("");
  const busy = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  const q = questions[index];
  const last = index === questions.length - 1;
  const left = timed ? remainingMs(startedAt, now) : null;
  const timedOut = phase === "choosing" && left === 0;

  // Tick the per-question clock while a question is open.
  useEffect(() => {
    if (!timed || phase !== "choosing") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timed, phase, index]);

  // Move focus to the new question so screen readers start reading it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [index]);

  // Keep the explanation in view above the sticky action bar.
  useEffect(() => {
    if (reveal)
      revealRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [reveal]);

  const record = useCallback(
    (
      result: QuestionOutcome["result"],
      chosenKey: string | null,
      rev: AnswerResult | null,
    ) => {
      const question = questions[index];
      setOutcomes((o) => [
        ...o,
        {
          questionId: question.id,
          moduleId: question.moduleId,
          moduleTitle: question.moduleTitle,
          result,
        },
      ]);
      setReviews((r) => [...r, { question, chosenKey, reveal: rev }]);
    },
    [questions, index],
  );

  async function commit() {
    if (busy.current || phase !== "choosing" || !selected || timedOut) return;
    busy.current = true;
    setPhase("submitting");
    setError(null);
    const chosen = selected;
    let res: Awaited<ReturnType<typeof answerPractice>>;
    try {
      res = await answerPractice({
        questionId: q.id,
        chosenKey: chosen,
        mode: timed ? "timed" : "practice",
        timeMs: timed ? elapsedMs(startedAt, Date.now()) : undefined,
      });
    } catch {
      res = {
        ok: false,
        error:
          "Couldn't reach the server. Check your connection and try again.",
      };
    }
    busy.current = false;
    if (!res.ok) {
      setPhase("choosing");
      setError(res.error);
      return;
    }
    setReveal(res.data);
    setPhase("revealed");
    record(res.data.correct ? "correct" : "wrong", chosen, res.data);
    setAnnounce(
      res.data.correct
        ? "Correct."
        : `Incorrect. The correct answer is ${res.data.correctKey}.`,
    );
    onAnswered();
  }

  function advance(skipped: boolean) {
    if (busy.current) return;
    // A question that's moving on without an answer (skipped or timed out) is recorded as skipped.
    const nextOutcomes = skipped
      ? [
          ...outcomes,
          {
            questionId: q.id,
            moduleId: q.moduleId,
            moduleTitle: q.moduleTitle,
            result: "skipped" as const,
          },
        ]
      : outcomes;
    const nextReviews = skipped
      ? [...reviews, { question: q, chosenKey: null, reveal: null }]
      : reviews;
    if (last) {
      onDone({ outcomes: nextOutcomes, reviews: nextReviews });
      return;
    }
    if (skipped) {
      setOutcomes(nextOutcomes);
      setReviews(nextReviews);
    }
    setIndex(index + 1);
    setSelected(null);
    setReveal(null);
    setError(null);
    setAnnounce("");
    setPhase("choosing");
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
  }

  function endEarly() {
    if (busy.current) return;
    onDone({ outcomes, reviews });
  }

  // Keyboard: 1-4 / A-D choose, Enter submits or moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, [contenteditable=true]"))
        return;
      if (phase === "choosing" && !timedOut) {
        const key = optionForKey(
          e.key,
          q.options.map((o) => o.key),
          { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
        );
        if (key) {
          e.preventDefault();
          setSelected(key);
          setError(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.repeat) {
        // Let a focused Skip / Next / End button do its own thing; options and the page body fall through to us.
        if (t && t.closest("button, a") && !t.closest("[data-option]")) return;
        if (phase === "choosing" && selected && !timedOut) {
          e.preventDefault();
          void commit();
        } else if (phase === "revealed" || timedOut) {
          e.preventDefault();
          advance(timedOut);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const answered = outcomes.filter((o) => o.result !== "skipped").length;
  const correctSoFar = outcomes.filter((o) => o.result === "correct").length;
  const done = index + (phase === "revealed" ? 1 : 0);
  const optionsLocked = phase !== "choosing" || timedOut;
  const tally = reveal ? tallyText(reveal.tally) : null;

  return (
    <div data-session className="mx-auto max-w-3xl space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{label}</span>
        </p>
        <p
          className="tabular text-sm text-ink-2"
          aria-label={`${correctSoFar} correct out of ${answered} answered`}
        >
          {correctSoFar}/{answered} correct
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold text-ink">
            Question {index + 1} of {questions.length}
          </p>
          {timed && left !== null && phase !== "revealed" && (
            <p
              role="timer"
              aria-label={`Time left: ${formatClock(left)}`}
              className={cn(
                "tabular inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold",
                left <= 15_000
                  ? "bg-warn-soft text-warn"
                  : "bg-surface-2 text-ink-2",
              )}
            >
              <Timer aria-hidden className="size-4" />
              {formatClock(left)}
              {left <= 15_000 && left > 0 && (
                <span className="sr-only"> left, hurry</span>
              )}
            </p>
          )}
        </div>
        <ProgressBar
          value={done}
          max={questions.length}
          label={`Progress: ${done} of ${questions.length} done`}
        />
      </div>

      <Card>
        <div className="p-5 max-sm:p-4">
          <p className="text-xs font-semibold text-ink-2">
            {q.topicName} · {q.moduleTitle}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="q-stem"
            className="mt-1.5 whitespace-pre-wrap text-xl font-semibold leading-snug tracking-tight text-ink"
            style={{ outline: "none" }}
          >
            {q.stem}
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="q-stem"
            className="mt-5 grid gap-2.5"
          >
            {q.options.map((o, i) => {
              const chosen = selected === o.key;
              const isCorrect = reveal?.correctKey === o.key;
              const wrongPick = !!reveal && chosen && !isCorrect;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-disabled={optionsLocked}
                  data-option
                  onClick={() => {
                    if (optionsLocked) return;
                    setSelected(o.key);
                    setError(null);
                  }}
                  className={cn(
                    "flex min-h-14 w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    isCorrect
                      ? "border-good/70 bg-good-soft"
                      : wrongPick
                        ? "border-risk/70 bg-risk-soft"
                        : chosen
                          ? "border-brand bg-brand-soft"
                          : "border-border-strong bg-surface-2",
                    !optionsLocked && !chosen && "hover:bg-surface-3",
                    optionsLocked &&
                      !isCorrect &&
                      !wrongPick &&
                      !chosen &&
                      "opacity-70",
                    optionsLocked && "cursor-default",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-px grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold",
                      isCorrect
                        ? "border-good bg-good text-brand-ink"
                        : wrongPick
                          ? "border-risk bg-risk text-brand-ink"
                          : chosen
                            ? "border-brand bg-brand text-brand-ink"
                            : "border-border-strong text-ink-2",
                    )}
                  >
                    {isCorrect ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : wrongPick ? (
                      <X className="size-4" strokeWidth={3} />
                    ) : (
                      o.key
                    )}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap pt-1 text-ink">
                    <span className="sr-only">Option {o.key}: </span>
                    {o.text}
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 pt-1 text-xs font-semibold sm:flex">
                    {isCorrect && (
                      <span className="text-good">Correct answer</span>
                    )}
                    {wrongPick && (
                      <span className="text-risk">Your answer</span>
                    )}
                    {!reveal && (
                      <kbd
                        aria-hidden
                        className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-ink-3"
                      >
                        {i + 1}
                      </kbd>
                    )}
                  </span>
                  {reveal && (isCorrect || wrongPick) && (
                    <span className="sr-only">
                      {isCorrect ? "Correct answer" : "Your answer, incorrect"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {timedOut && (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm font-medium text-warn"
            >
              <Timer aria-hidden className="size-4" /> Time&apos;s up. This
              question counts as skipped.
            </p>
          )}
          <div className="mt-4">
            <FormError message={error ?? undefined} />
          </div>

          {reveal && (
            <div
              className={cn(
                "mt-4 scroll-mb-28 rounded-xl border p-4",
                reveal.correct
                  ? "border-good/50 bg-good-soft"
                  : "border-risk/50 bg-risk-soft",
              )}
              data-testid="reveal"
              ref={revealRef}
            >
              <p
                className={cn(
                  "flex items-center gap-2 text-lg font-semibold",
                  reveal.correct ? "text-good" : "text-risk",
                )}
              >
                {reveal.correct ? (
                  <CircleCheck aria-hidden className="size-5" />
                ) : (
                  <CircleX aria-hidden className="size-5" />
                )}
                {reveal.correct
                  ? "Correct"
                  : `Not quite. The answer is ${reveal.correctKey}.`}
              </p>
              {reveal.explanation && (
                <p className="mt-2 whitespace-pre-wrap text-ink">
                  {reveal.explanation}
                </p>
              )}
              {tally && (
                <p className="mt-3 border-t border-border/60 pt-2.5 text-sm text-ink-2">
                  In this chapter you&apos;ve answered {tally} on the platform.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-strong bg-surface/95 p-3 shadow-[var(--shadow)] backdrop-blur max-sm:bottom-2">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            onClick={() => advance(true)}
            disabled={phase !== "choosing" || timedOut}
          >
            <SkipForward aria-hidden className="size-4" /> Skip
          </Button>
          <Button
            variant="ghost"
            onClick={endEarly}
            disabled={phase === "submitting"}
          >
            <Flag aria-hidden className="size-4" /> End session
          </Button>
        </div>
        {phase === "revealed" || timedOut ? (
          <Button
            size="lg"
            onClick={() => advance(timedOut)}
            className="max-sm:flex-1"
          >
            {last ? "See results" : "Next question"}{" "}
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={commit}
            disabled={!selected || phase === "submitting"}
            aria-busy={phase === "submitting"}
            className="max-sm:flex-1"
          >
            {phase === "submitting" ? "Checking…" : "Submit answer"}
          </Button>
        )}
      </div>
      <p className="hidden text-center text-xs text-ink-3 sm:block">
        Keys: <kbd className="font-mono">1</kbd>–
        <kbd className="font-mono">{q.options.length}</kbd> or{" "}
        <kbd className="font-mono">A</kbd>–
        <kbd className="font-mono">{q.options[q.options.length - 1]?.key}</kbd>{" "}
        to choose, <kbd className="font-mono">Enter</kbd> to submit or continue.
        {timed && ` ${TIMED_SECONDS_PER_QUESTION} seconds per question.`}
      </p>
    </div>
  );
}
