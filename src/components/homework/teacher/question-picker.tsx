"use client";

import { useRef, useState, useTransition } from "react";
import {
  pickAndPreviewQuestions,
  type QuestionPreview,
} from "@/app/actions/teacher-homework";
import { Badge, Button, Input } from "@/components/ui";
import { plural } from "@/lib/format";
import { difficultyLabel, type TopicOption } from "./builder-types";
import { Spinner } from "./file-drop";

const MAX_QUESTIONS = 40;

/**
 * Auto-marked multiple-choice questions: choose chapters + how many, preview what was picked,
 * then remove or swap individual questions. Teachers can see the answer key here.
 */
export function QuestionPicker({
  topics,
  questions,
  onChange,
  initialModuleIds,
  disabled,
}: {
  topics: TopicOption[];
  questions: QuestionPreview[];
  onChange: (next: QuestionPreview[]) => void;
  initialModuleIds: string[];
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialModuleIds),
  );
  const [count, setCount] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Questions the teacher removed or swapped out: don't bring them straight back.
  const skipped = useRef<string[]>([]);

  const moduleById = new Map(
    topics.flatMap((t) => t.modules).map((m) => [m.id, m]),
  );
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const exclude = () =>
    [...questions.map((q) => q.id), ...skipped.current].slice(-80);

  const pick = () => {
    setError(null);
    setNotice(null);
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_QUESTIONS)
      return setError(`Enter a whole number from 1 to ${MAX_QUESTIONS}.`);
    if (selected.size === 0)
      return setError("Tick at least one chapter first.");
    start(async () => {
      const r = await pickAndPreviewQuestions({
        moduleIds: [...selected],
        count: n,
        excludeIds: exclude(),
      });
      if (!r.ok) return setError(r.error);
      if (r.data.questions.length === 0)
        return setNotice("No more questions are available in those chapters.");
      onChange([...questions, ...r.data.questions]);
      const missing = r.data.uncoveredModuleIds
        .map((id) => moduleById.get(id))
        .filter(Boolean);
      setNotice(
        `Added ${plural(r.data.questions.length, "question")}.` +
          (r.data.questions.length < n
            ? ` Only ${r.data.questions.length} were available.`
            : "") +
          (missing.length
            ? ` Nothing was added from ${missing.map((m) => `chapter ${m!.number}`).join(", ")}.`
            : ""),
      );
    });
  };

  const remove = (id: string) => {
    skipped.current.push(id);
    onChange(questions.filter((q) => q.id !== id));
    setNotice("Question removed.");
  };

  const replace = async (q: QuestionPreview) => {
    if (!q.moduleId) return;
    setError(null);
    setBusyId(q.id);
    const r = await pickAndPreviewQuestions({
      moduleIds: [q.moduleId],
      count: 1,
      excludeIds: [...exclude(), q.id].slice(-80),
    });
    setBusyId(null);
    if (!r.ok) return setError(r.error);
    const next = r.data.questions[0];
    if (!next)
      return setNotice(
        "There are no other questions left in that chapter to swap in.",
      );
    skipped.current.push(q.id);
    onChange(questions.map((x) => (x.id === q.id ? next : x)));
    setNotice("Question swapped.");
  };

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium text-ink">
          Chapters to draw from
        </legend>
        <div
          className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2"
          tabIndex={0}
          role="group"
          aria-label="Chapters"
        >
          {topics.map((t) => {
            const usable = t.modules.filter((m) => m.count > 0);
            const picked = t.modules.filter((m) => selected.has(m.id)).length;
            return (
              <details
                key={t.id}
                open={picked > 0}
                className="rounded-lg border border-border bg-surface"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-ink max-sm:min-h-11">
                  <span className="min-w-0">{t.name}</span>
                  <span className="shrink-0 text-xs font-medium text-ink-2">
                    {picked
                      ? `${picked} chosen`
                      : `${usable.length} with questions`}
                  </span>
                </summary>
                <div className="border-t border-border px-3 py-2">
                  {usable.length > 1 && (
                    <div className="mb-1 flex gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        className="py-1 text-link hover:underline max-sm:py-2.5"
                        onClick={() =>
                          usable.forEach((m) => toggle(m.id, true))
                        }
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="py-1 text-link hover:underline max-sm:py-2.5"
                        onClick={() =>
                          t.modules.forEach((m) => toggle(m.id, false))
                        }
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <ul>
                    {t.modules.map((m) => (
                      <li key={m.id}>
                        <label
                          className={`flex items-start gap-2.5 py-1.5 text-sm max-sm:py-2.5 ${m.count ? "cursor-pointer text-ink" : "text-ink-3"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={selected.has(m.id)}
                            disabled={m.count === 0}
                            onChange={(e) => toggle(m.id, e.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="tabular text-ink-3">
                              {m.number}.
                            </span>{" "}
                            {m.title}
                          </span>
                          <span className="shrink-0 text-xs text-ink-2">
                            {m.count
                              ? plural(m.count, "question")
                              : "No questions yet"}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="mcq-count"
              className="block text-sm font-medium text-ink"
            >
              How many questions
            </label>
            <Input
              id="mcq-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_QUESTIONS}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={pick}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <Spinner /> Picking…
              </>
            ) : questions.length ? (
              "Add more questions"
            ) : (
              "Pick questions"
            )}
          </Button>
          <p className="basis-full text-sm text-ink-2 sm:basis-auto">
            {selected.size
              ? `${plural(selected.size, "chapter")} chosen. `
              : ""}
            Spread across chapters, easier questions first.
          </p>
        </div>
      </fieldset>

      <div aria-live="polite" className="min-h-5 text-sm text-ink-2">
        {notice}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
        >
          {error}
        </p>
      )}

      {questions.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">
              {plural(questions.length, "auto-marked question")} (answer keys
              visible to you only)
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                skipped.current.push(...questions.map((q) => q.id));
                onChange([]);
                setNotice("All questions removed.");
              }}
            >
              Remove all
            </Button>
          </div>
          <ol className="space-y-2">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className="rounded-xl border border-border bg-surface-2 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-ink-2"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 text-sm text-ink">{q.stem}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                      <Badge>{difficultyLabel(q.difficulty)}</Badge>
                      <span>
                        {q.topicName} · ch. {q.moduleNumber}
                      </span>
                    </p>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer font-medium text-link max-sm:py-2">
                        Show options and correct answer
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {q.options.map((o) => (
                          <li
                            key={o.key}
                            className={
                              o.key === q.correctKey
                                ? "font-semibold text-good"
                                : "text-ink-2"
                            }
                          >
                            {o.key}. {o.text}
                            {o.key === q.correctKey && <span> (correct)</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || busyId === q.id}
                      onClick={() => replace(q)}
                      aria-label={`Swap question ${i + 1} for another from the same chapter`}
                    >
                      {busyId === q.id ? <Spinner /> : "Swap"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => remove(q.id)}
                      aria-label={`Remove question ${i + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
