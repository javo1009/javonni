"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  BookOpen,
  Layers,
  Search,
  Shuffle,
  Target,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { startPractice } from "@/app/actions/student";
import {
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormError,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { TIMED_SECONDS_PER_QUESTION } from "./logic";
import type {
  ChapterOption,
  PracticeData,
  ScopeChoice,
  SessionConfig,
} from "./types";
import type { PracticeQuestion } from "@/services/practice";

const COUNTS = [5, 10, 20] as const;

const SCOPES = [
  {
    kind: "module",
    label: "A chapter",
    hint: "One module, in depth",
    icon: BookOpen,
  },
  {
    kind: "topic",
    label: "A whole topic",
    hint: "All chapters in a topic",
    icon: Layers,
  },
  {
    kind: "weak",
    label: "Weak chapters",
    hint: "Where your scores are low",
    icon: Target,
  },
  {
    kind: "mixed",
    label: "Mixed review",
    hint: "Across the curriculum",
    icon: Shuffle,
  },
] as const;

type Kind = (typeof SCOPES)[number]["kind"];

const rowClass =
  "relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

function ScoreTag({ c, threshold }: { c: ChapterOption; threshold: number }) {
  if (c.score === null) return null;
  const weak = c.score < threshold;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        weak ? "bg-warn-soft text-warn" : "bg-surface-3 text-ink-2",
      )}
    >
      {weak && <TriangleAlert aria-hidden className="size-3" />}
      Score {c.score}%{weak && <span className="sr-only"> (weak)</span>}
    </span>
  );
}

export function PracticeSetup({
  data,
  initial,
  onStart,
}: {
  data: PracticeData;
  initial: ScopeChoice | null;
  onStart: (cfg: SessionConfig, questions: PracticeQuestion[]) => void;
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "module");
  const [moduleId, setModuleId] = useState<string | null>(
    initial?.kind === "module" ? initial.id : null,
  );
  const [topicId, setTopicId] = useState<string | null>(
    initial?.kind === "topic" ? initial.id : null,
  );
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<(typeof COUNTS)[number]>(10);
  const [timed, setTimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chapters = useMemo(
    () => data.topics.flatMap((t) => t.chapters),
    [data.topics],
  );
  const chapter = chapters.find((c) => c.id === moduleId) ?? null;
  const topic = data.topics.find((t) => t.id === topicId) ?? null;
  const weakQuestions = data.weak.reduce((s, c) => s + c.questions, 0);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      data.topics
        .map((t) => ({
          ...t,
          chapters: t.chapters.filter(
            (c) =>
              !q ||
              c.title.toLowerCase().includes(q) ||
              `${c.number}` === q ||
              t.name.toLowerCase().includes(q),
          ),
        }))
        .filter((t) => t.chapters.length > 0),
    [data.topics, q],
  );
  const matches = filtered.reduce((n, t) => n + t.chapters.length, 0);

  const scope: ScopeChoice | null =
    kind === "module"
      ? moduleId
        ? { kind: "module", id: moduleId }
        : null
      : kind === "topic"
        ? topicId
          ? { kind: "topic", id: topicId }
          : null
        : { kind };
  const available =
    kind === "module"
      ? (chapter?.questions ?? 0)
      : kind === "topic"
        ? (topic?.questions ?? 0)
        : kind === "weak"
          ? weakQuestions
          : data.totalQuestions;
  const label =
    kind === "module" && chapter
      ? `Chapter ${chapter.number} · ${chapter.title}`
      : kind === "topic" && topic
        ? topic.name
        : kind === "weak"
          ? "Weak chapters"
          : kind === "mixed"
            ? "Mixed review"
            : null;
  const canStart = !!scope && available > 0 && !pending;
  const willGet = Math.min(count, available);

  function start() {
    if (!scope || !label || !canStart) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await startPractice(scope, count);
        if (!res.ok) return setError(res.error);
        if (res.data.length === 0)
          return setError("There are no questions for that yet.");
        onStart({ scope, label, count, timed }, res.data);
      } catch {
        setError(
          "Couldn't reach the server. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <div className="space-y-5">
        <Card aria-labelledby="scope-title">
          <CardHeader id="scope-title" title="What do you want to practise?" />
          <CardBody>
            <div
              role="radiogroup"
              aria-labelledby="scope-title"
              className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
            >
              {SCOPES.map((s) => (
                <label
                  key={s.kind}
                  className={cn(
                    "relative flex min-h-[4.5rem] cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                    kind === s.kind
                      ? "border-brand bg-brand-soft"
                      : "border-border-strong bg-surface-2 hover:bg-surface-3",
                  )}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={s.kind}
                    checked={kind === s.kind}
                    onChange={() => (setKind(s.kind), setError(null))}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <s.icon
                      aria-hidden
                      className={cn(
                        "size-4",
                        kind === s.kind ? "text-brand" : "text-ink-2",
                      )}
                    />
                    {s.label}
                    {s.kind === "weak" && (
                      <span className="tabular rounded-full bg-surface-3 px-1.5 text-xs text-ink-2">
                        {data.weak.length}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-2">{s.hint}</span>
                </label>
              ))}
            </div>
          </CardBody>
        </Card>

        {kind === "module" && (
          <Card aria-labelledby="chapter-title">
            <CardHeader
              id="chapter-title"
              title="Choose a chapter"
              subtitle="Question counts show what's in the bank for each chapter."
            />
            <CardBody className="space-y-3">
              <div className="relative">
                <label htmlFor="chapter-search" className="sr-only">
                  Search chapters
                </label>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
                />
                <Input
                  id="chapter-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chapters by name or number"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-ink-2"
              >
                {q
                  ? `${plural(matches, "chapter")} match`
                  : `${chapters.length} chapters`}
              </p>
              <div
                role="radiogroup"
                aria-label="Chapters"
                className="max-h-[26rem] space-y-4 overflow-y-auto overscroll-contain pr-1"
              >
                {filtered.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-2">
                    No chapters match &ldquo;{query}&rdquo;.
                  </p>
                )}
                {filtered.map((t) => (
                  <fieldset key={t.id} className="min-w-0 border-0 p-0">
                    <legend className="sticky top-0 z-10 -mx-1 mb-1.5 w-full bg-surface px-1 py-1 text-xs font-bold uppercase tracking-[0.12em] text-eyebrow">
                      {t.name}{" "}
                      <span className="font-medium normal-case tracking-normal text-ink-3">
                        · {plural(t.questions, "question")}
                      </span>
                    </legend>
                    <div className="grid gap-1.5">
                      {t.chapters.map((c) => (
                        <label
                          key={c.id}
                          className={cn(
                            rowClass,
                            moduleId === c.id
                              ? "border-brand bg-brand-soft"
                              : "border-border bg-surface-2 hover:bg-surface-3",
                          )}
                        >
                          <input
                            type="radio"
                            name="chapter"
                            value={c.id}
                            checked={moduleId === c.id}
                            disabled={c.questions === 0}
                            onChange={() => (setModuleId(c.id), setError(null))}
                            className="sr-only"
                          />
                          <span
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0 rounded-full border-2",
                              moduleId === c.id
                                ? "border-brand bg-brand shadow-[inset_0_0_0_3px_var(--brand-soft)]"
                                : "border-border-strong",
                            )}
                          />
                          <span className="tabular w-6 shrink-0 text-sm font-semibold text-ink-2">
                            {c.number}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-snug text-ink">
                              {c.title}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                              {c.questions > 0
                                ? plural(c.questions, "question")
                                : "No questions yet"}
                              <ScoreTag c={c} threshold={data.weakThreshold} />
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {kind === "topic" && (
          <Card aria-labelledby="topic-title">
            <CardHeader
              id="topic-title"
              title="Choose a topic"
              subtitle="You'll get questions from across its chapters."
            />
            <CardBody>
              <div
                role="radiogroup"
                aria-labelledby="topic-title"
                className="grid gap-1.5 sm:grid-cols-2"
              >
                {data.topics.map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      rowClass,
                      topicId === t.id
                        ? "border-brand bg-brand-soft"
                        : "border-border bg-surface-2 hover:bg-surface-3",
                    )}
                  >
                    <input
                      type="radio"
                      name="topic"
                      value={t.id}
                      checked={topicId === t.id}
                      disabled={t.questions === 0}
                      onChange={() => (setTopicId(t.id), setError(null))}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        topicId === t.id
                          ? "border-brand bg-brand shadow-[inset_0_0_0_3px_var(--brand-soft)]"
                          : "border-border-strong",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug text-ink">
                        {t.name}
                      </span>
                      <span className="text-xs text-ink-2">
                        {t.questions > 0
                          ? `${plural(t.questions, "question")} in ${plural(t.chapters.filter((c) => c.questions > 0).length, "chapter")}`
                          : "No questions yet"}{" "}
                        · exam weight {t.weightLabel}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {kind === "weak" && (
          <Card aria-labelledby="weak-title">
            <CardHeader
              id="weak-title"
              title="Your weak chapters"
              subtitle={`Chapters where your recorded practice score is below ${data.weakThreshold}%.`}
            />
            <CardBody>
              {data.weak.length === 0 ? (
                <EmptyState
                  title="No weak chapters yet"
                  action={
                    <Link
                      href="/student/chapters"
                      className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-surface-2 px-4 text-sm font-semibold text-ink hover:bg-surface-3 max-sm:h-11"
                    >
                      Record scores on the chapters page
                    </Link>
                  }
                >
                  Record a practice score for a few chapters and the ones below{" "}
                  {data.weakThreshold}% will show up here. Or try a mixed
                  review.
                </EmptyState>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {data.weak.map((c) => (
                    <li
                      key={c.id}
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5"
                    >
                      <span className="tabular w-6 shrink-0 text-sm font-semibold text-ink-2">
                        {c.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-ink">
                          {c.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                          {plural(c.questions, "question")}
                          <ScoreTag c={c} threshold={data.weakThreshold} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}

        {kind === "mixed" && (
          <Card>
            <CardHeader title="Mixed review" />
            <CardBody>
              <p className="text-ink-2">
                A spread of questions from across the whole curriculum,
                favouring ones you haven&apos;t seen, got wrong before, or that
                sit in heavily weighted topics. There are {data.totalQuestions}{" "}
                {data.totalQuestions === 1 ? "question" : "questions"} in the
                bank.
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      <aside
        className="space-y-4 lg:sticky lg:top-4"
        aria-label="Session settings"
      >
        <Card>
          <CardHeader title="Your session" />
          <CardBody className="space-y-5">
            <div>
              <p className="text-sm font-medium text-ink-2">Practising</p>
              {label ? (
                <p className="mt-0.5 font-semibold leading-snug text-ink">
                  {label}
                </p>
              ) : (
                <p className="mt-0.5 text-ink-2">
                  {kind === "module"
                    ? "Pick a chapter on the left."
                    : "Pick a topic on the left."}
                </p>
              )}
              {scope && (
                <p
                  className={cn(
                    "mt-1 text-sm",
                    available === 0 ? "text-warn" : "text-ink-2",
                  )}
                >
                  {available === 0
                    ? kind === "weak"
                      ? "No weak chapters with questions yet."
                      : "No questions here yet. Try another one."
                    : `${plural(available, "question")} available`}
                </p>
              )}
            </div>

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 text-sm font-medium text-ink">
                Number of questions
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {COUNTS.map((n) => (
                  <label
                    key={n}
                    className={cn(
                      "relative grid h-11 cursor-pointer place-items-center rounded-[10px] border text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                      count === n
                        ? "border-brand bg-brand-soft text-ink"
                        : "border-border-strong bg-surface-2 text-ink-2 hover:bg-surface-3",
                    )}
                  >
                    <input
                      type="radio"
                      name="count"
                      value={n}
                      checked={count === n}
                      onChange={() => setCount(n)}
                      className="sr-only"
                    />
                    {n}
                  </label>
                ))}
              </div>
              {scope && available > 0 && available < count && (
                <p className="mt-2 text-sm text-ink-2">
                  Only {plural(available, "question")} here, so you&apos;ll get{" "}
                  {willGet}.
                </p>
              )}
            </fieldset>

            <label className="relative flex min-h-11 cursor-pointer items-start gap-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]">
              <input
                type="checkbox"
                checked={timed}
                onChange={(e) => setTimed(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Timer aria-hidden className="size-4 text-ink-2" /> Timed mode
                </span>
                <span className="block text-sm text-ink-2">
                  {TIMED_SECONDS_PER_QUESTION} seconds per question, like the
                  exam. Unanswered questions when time runs out count as
                  skipped.
                </span>
              </span>
            </label>

            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                disabled={!canStart}
                aria-busy={pending}
                onClick={start}
              >
                {pending
                  ? "Finding questions…"
                  : `Start ${willGet > 0 ? plural(willGet, "question") : "practice"}`}
              </Button>
              <FormError message={error ?? undefined} />
            </div>
          </CardBody>
        </Card>
        <Banner tone="neutral" title="How it works">
          Pick an answer, then submit it to see the right answer and why. Your
          results feed your chapter tally.
        </Banner>
      </aside>
    </div>
  );
}
