import type { Metadata } from "next";
import Link from "next/link";
import { difficultyLabel } from "@/components/homework/teacher/builder-types";
import {
  Badge,
  Banner,
  buttonClass,
  Card,
  EmptyState,
  Metric,
  PageHeader,
  Select,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { getCurriculumOrNull, teacherContext } from "@/server/context";
import { listQuestions, questionCoverage } from "@/services/question-bank";

export const metadata: Metadata = { title: "Question bank · Ascent" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function QuestionBankPage({
  searchParams,
}: PageProps<"/teacher/questions">) {
  const { actor, db } = await teacherContext();
  const sp = await searchParams;
  const cur = await getCurriculumOrNull();
  if (!cur) {
    return (
      <>
        <PageHeader eyebrow="Question bank" title="Question bank" />
        <EmptyState title="No active curriculum">
          An admin needs to set up the curriculum before questions can be
          browsed.
        </EmptyState>
      </>
    );
  }

  const coverage = await questionCoverage(db, actor);
  const moduleId =
    one(sp.module) && cur.moduleById.has(one(sp.module)!)
      ? one(sp.module)!
      : undefined;
  const topicId = moduleId
    ? cur.moduleById.get(moduleId)!.topicId
    : one(sp.topic) && cur.topicById.has(one(sp.topic)!)
      ? one(sp.topic)!
      : undefined;
  const search = (one(sp.q) ?? "").trim().slice(0, 100);
  const d = Number(one(sp.d));
  const difficulty = d === 1 || d === 2 || d === 3 ? d : undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const result = await listQuestions(db, actor, {
    moduleId,
    topicId: moduleId ? undefined : topicId,
    search,
    difficulty,
    page,
  });

  const totalQuestions = [...coverage.values()].reduce(
    (s, c) => s + c.total,
    0,
  );
  const covered = cur.modules.filter(
    (m) => (coverage.get(m.id)?.total ?? 0) > 0,
  ).length;
  const mod = moduleId ? cur.moduleById.get(moduleId)! : null;
  const topic = topicId ? cur.topicById.get(topicId)! : null;
  const modCount = moduleId ? (coverage.get(moduleId)?.total ?? 0) : 0;

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const cur2: Record<string, string | number | undefined> = {
      topic: moduleId ? undefined : topicId,
      module: moduleId,
      q: search || undefined,
      d: difficulty,
      ...over,
    };
    for (const [k, v] of Object.entries(cur2))
      if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/teacher/questions${s ? `?${s}` : ""}`;
  };
  const tree = (
    <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
      <Link
        href={qs({ topic: undefined, module: undefined, page: undefined })}
        aria-current={!moduleId && !topicId ? "page" : undefined}
        className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold max-sm:min-h-11",
          !moduleId && !topicId
            ? "bg-brand-soft text-brand"
            : "text-ink hover:bg-surface-2",
        )}
      >
        All questions <span className="tabular text-xs">{totalQuestions}</span>
      </Link>
      {cur.topics.map((t) => {
        const mods = cur.modules.filter((m) => m.topicId === t.id);
        const n = mods.reduce(
          (s, m) => s + (coverage.get(m.id)?.total ?? 0),
          0,
        );
        return (
          <details key={t.id} open={t.id === topicId} className="rounded-lg">
            <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2 max-sm:min-h-11">
              <span className="min-w-0">{t.name}</span>
              <span
                className={cn(
                  "tabular shrink-0 text-xs",
                  n === 0 ? "text-warn" : "text-ink-2",
                )}
              >
                {n === 0 ? "none yet" : n}
              </span>
            </summary>
            <ul className="mb-1 ml-2 border-l border-border pl-2">
              <li>
                <Link
                  href={qs({ topic: t.id, module: undefined, page: undefined })}
                  aria-current={
                    t.id === topicId && !moduleId ? "page" : undefined
                  }
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm max-sm:py-2.5",
                    t.id === topicId && !moduleId
                      ? "bg-brand-soft font-semibold text-brand"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  Whole topic
                </Link>
              </li>
              {mods.map((m) => {
                const c = coverage.get(m.id)?.total ?? 0;
                return (
                  <li key={m.id}>
                    <Link
                      href={qs({
                        topic: undefined,
                        module: m.id,
                        page: undefined,
                      })}
                      aria-current={m.id === moduleId ? "page" : undefined}
                      className={cn(
                        "flex items-start justify-between gap-2 rounded-md px-3 py-1.5 text-sm max-sm:py-2.5",
                        m.id === moduleId
                          ? "bg-brand-soft font-semibold text-brand"
                          : c === 0
                            ? "text-ink-3 hover:text-ink-2"
                            : "text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="tabular">{m.number}.</span> {m.title}
                      </span>
                      <span
                        className={cn(
                          "tabular shrink-0 text-xs",
                          c === 0 && "text-warn",
                        )}
                      >
                        {c === 0 ? "none yet" : c}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
  const filtered = !!(moduleId || topicId || search || difficulty);

  return (
    <>
      <PageHeader
        eyebrow="Question bank"
        title="Question bank"
        description="Browse the published multiple-choice questions by topic and chapter, with answer keys and explanations. Pick from them when you build homework."
      />

      <div className="mb-6">
        <Banner tone="brand" title="Read-only for teachers">
          Questions are written and imported by admins (Admin → Question
          coverage). Ask an admin to add questions for chapters that show
          &ldquo;No questions yet&rdquo;.
        </Banner>
      </div>

      <section aria-label="Coverage" className="mb-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Published questions" value={totalQuestions} primary />
        <Metric
          label="Chapters with questions"
          value={covered}
          unit={`of ${cur.modules.length}`}
          meter={cur.modules.length ? covered / cur.modules.length : 0}
        />
        <Metric
          label="Chapters with none yet"
          value={cur.modules.length - covered}
          hint="Can't be used for homework until questions are added"
        />
      </section>

      <div className="grid gap-6 pb-4 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Topics and chapters" className="lg:sticky lg:top-4">
          <Card className="overflow-hidden">
            <details className="lg:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-ink">
                Chapters{" "}
                {mod
                  ? `· ${mod.number}. ${mod.title}`
                  : topic
                    ? `· ${topic.name}`
                    : "(choose one)"}
              </summary>
              {tree}
            </details>
            <div className="hidden lg:block">{tree}</div>
          </Card>
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {mod
                  ? `${mod.number}. ${mod.title}`
                  : topic
                    ? topic.name
                    : "All questions"}
              </h2>
              <p className="mt-0.5 text-sm text-ink-2" aria-live="polite">
                {plural(result.total, "question")}
                {search ? ` matching “${search}”` : ""}
                {difficulty
                  ? ` · ${difficultyLabel(difficulty).toLowerCase()} only`
                  : ""}
              </p>
            </div>
            {mod && modCount > 0 && (
              <Link
                href={`/teacher/homework/new?module=${mod.id}`}
                className={buttonClass("primary", "md")}
              >
                Start homework from this chapter
              </Link>
            )}
          </div>

          <form
            method="get"
            action="/teacher/questions"
            role="search"
            aria-label="Search questions"
            className="flex flex-wrap items-end gap-3"
          >
            {moduleId ? (
              <input type="hidden" name="module" value={moduleId} />
            ) : topicId ? (
              <input type="hidden" name="topic" value={topicId} />
            ) : null}
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <label
                htmlFor="qsearch"
                className="block text-sm font-medium text-ink"
              >
                Search question text
              </label>
              <Input
                id="qsearch"
                name="q"
                type="search"
                defaultValue={search}
                placeholder="e.g. duration, covenant, p-value"
              />
            </div>
            <div className="w-40 space-y-1.5 max-sm:w-full max-sm:basis-full">
              <label
                htmlFor="qdiff"
                className="block text-sm font-medium text-ink"
              >
                Difficulty
              </label>
              <Select id="qdiff" name="d" defaultValue={difficulty ?? ""}>
                <option value="">Any</option>
                <option value="1">Easy</option>
                <option value="2">Medium</option>
                <option value="3">Hard</option>
              </Select>
            </div>
            <button
              type="submit"
              className={buttonClass("secondary", "md", "h-11")}
            >
              Search
            </button>
            {filtered && (search || difficulty) && (
              <Link
                href={qs({ q: undefined, d: undefined, page: undefined })}
                className="inline-flex h-11 items-center text-sm font-semibold text-link hover:underline"
              >
                Clear search
              </Link>
            )}
          </form>

          {result.total === 0 ? (
            mod && modCount === 0 && !search && !difficulty ? (
              <EmptyState title="No questions yet for this chapter">
                Homework can&apos;t include auto-marked questions from it. You
                can still assign file or written work. Admins add questions
                under Admin → Question coverage.
              </EmptyState>
            ) : (
              <EmptyState
                title="No questions match"
                action={
                  <Link
                    href="/teacher/questions"
                    className={buttonClass("secondary", "md")}
                  >
                    Reset filters
                  </Link>
                }
              >
                Try a different word, difficulty or chapter.
              </EmptyState>
            )
          ) : (
            <>
              <ol
                className="space-y-3"
                start={(result.page - 1) * result.pageSize + 1}
              >
                {result.items.map((q) => (
                  <li key={q.id}>
                    <Card>
                      <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge
                            tone={
                              q.difficulty === 1
                                ? "good"
                                : q.difficulty === 3
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {difficultyLabel(q.difficulty)}
                          </Badge>
                          <Badge>
                            {q.source === "sample"
                              ? "Sample"
                              : q.source === "authored"
                                ? "Authored"
                                : q.source}
                          </Badge>
                          {!moduleId && (
                            <Link
                              href={qs({
                                topic: undefined,
                                module: q.moduleId ?? undefined,
                                page: undefined,
                              })}
                              className="font-medium text-link hover:underline"
                            >
                              {q.topicName} · {q.moduleNumber}. {q.moduleTitle}
                            </Link>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap font-medium text-ink">
                          {q.stem}
                        </p>
                        <ul className="space-y-1.5">
                          {q.options.map((o) => (
                            <li
                              key={o.key}
                              className={cn(
                                "rounded-lg border px-3 py-2 text-sm",
                                o.key === q.correctKey
                                  ? "border-good/50 bg-good-soft font-semibold text-good"
                                  : "border-border text-ink-2",
                              )}
                            >
                              {o.key}. {o.text}
                              {o.key === q.correctKey && (
                                <span> (correct answer)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <details className="text-sm">
                          <summary className="cursor-pointer py-1 font-medium text-link max-sm:py-2.5">
                            Explanation
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap text-ink-2">
                            {q.explanation}
                          </p>
                        </details>
                      </div>
                    </Card>
                  </li>
                ))}
              </ol>
              {result.pageCount > 1 && (
                <nav
                  aria-label="Pages"
                  className="flex items-center justify-between gap-3 pt-1"
                >
                  {result.page > 1 ? (
                    <Link
                      href={qs({ page: result.page - 1 })}
                      className={buttonClass("secondary", "md")}
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="tabular text-sm text-ink-2">
                    Page {result.page} of {result.pageCount}
                  </span>
                  {result.page < result.pageCount ? (
                    <Link
                      href={qs({ page: result.page + 1 })}
                      className={buttonClass("secondary", "md")}
                    >
                      Next →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
