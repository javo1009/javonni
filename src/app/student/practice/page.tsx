import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, RotateCcw, Shuffle } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { levelFromMastery, MasteryCell } from "@/components/viz/mastery";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { questionCountsByLos } from "@/services/curriculum";
import { getStudentSnapshot } from "@/services/student-views";

export const metadata: Metadata = { title: "Practice" };

const COUNTS = [5, 10, 20] as const;

export default async function PracticePage({ searchParams }: PageProps<"/student/practice">) {
  const { actor, db, now } = await studentContext();
  const c = await getCurriculum();
  const rawCount = Number((await searchParams).count);
  const count = (COUNTS as readonly number[]).includes(rawCount) ? rawCount : 10;
  const { snap } = await getStudentSnapshot(db, actor, c, now);
  const qCounts = await questionCountsByLos(db);
  const qFor = (losIds: string[]) => losIds.reduce((s, id) => s + (qCounts.get(id) ?? 0), 0);
  const href = (scope: string, id?: string) => `/student/practice/session?scope=${scope}${id ? `&id=${id}` : ""}&count=${count}`;
  const reviewDue = snap.coverage.reviewDue;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practice"
        description="Short sets with instant feedback. Every answer updates the map. Shortcuts: A/B/C to choose, Enter to check, N for next, E for the explanation."
      />

      <div className="flex flex-wrap items-center gap-3">
        <span id="count-label" className="text-sm font-medium text-ink">
          Questions per set
        </span>
        <nav aria-labelledby="count-label" className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
          {COUNTS.map((n) => (
            <Link
              key={n}
              href={`/student/practice?count=${n}`}
              aria-current={n === count ? "true" : undefined}
              scroll={false}
              className={cn(
                "tabular inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium sm:min-h-9",
                n === count ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              {n}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={href("mixed")} className="group rounded-[var(--radius-card)] border border-border bg-surface p-5 transition-colors hover:border-brand">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Shuffle className="size-5 text-brand" aria-hidden /> Smart mixed set
          </p>
          <p className="mt-1 text-sm text-ink-2">Picks what you most need: objectives due for review, ones you haven&apos;t tried, and weak spots.</p>
          <p className="mt-3 text-sm font-medium text-brand group-hover:underline">Start {count} questions</p>
        </Link>
        <Link href={href("review")} className="group rounded-[var(--radius-card)] border border-border bg-surface p-5 transition-colors hover:border-brand">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <RotateCcw className="size-5 text-warn" aria-hidden /> Review set
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {reviewDue > 0
              ? `${reviewDue} objective${reviewDue === 1 ? " is" : "s are"} due for review. Revisit them before they fade.`
              : "Nothing is due for review right now, so this leans on your weakest objectives."}
          </p>
          <p className="mt-3 text-sm font-medium text-brand group-hover:underline">Start {count} questions</p>
        </Link>
      </div>

      <Card aria-labelledby="topics-h">
        <CardHeader id="topics-h" title="By topic or module" subtitle="Open a topic to practise one of its modules." />
        <CardBody className="px-0 pb-2">
          <ul className="divide-y divide-border border-t border-border">
            {c.topics.map((t) => {
              const st = snap.topicStats.get(t.id)!;
              const tr = snap.readiness.topics.find((r) => r.topicId === t.id);
              const mods = c.modules.filter((m) => m.topicId === t.id);
              const topicQ = qFor(mods.flatMap((m) => m.losIds));
              return (
                <li key={t.id}>
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <MasteryCell level={levelFromMastery(st.mastery, (tr?.attemptedShare ?? 0) > 0)} label={(tr?.attemptedShare ?? 0) > 0 ? `Mastery ${pct(st.mastery)}` : "Not practised yet"} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="tabular block text-xs text-ink-2">
                          {(tr?.attemptedShare ?? 0) > 0 ? `Mastery ${pct(st.mastery)}` : "Not practised yet"} · {topicQ} question{topicQ === 1 ? "" : "s"}
                          {st.belowFloor && <span className="font-medium text-warn"> · below floor</span>}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
                    </summary>
                    <div className="space-y-1 bg-surface-2/50 px-5 pt-1 pb-3">
                      {topicQ > 0 ? (
                        <Link href={href("topic", t.id)} className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium text-brand hover:bg-surface">
                          Whole topic <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      ) : (
                        <p className="px-3 py-2 text-sm text-ink-2">No questions in this topic yet.</p>
                      )}
                      {mods.map((m) => {
                        const n = qFor(m.losIds);
                        return n > 0 ? (
                          <Link key={m.id} href={href("module", m.id)} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm text-ink hover:bg-surface">
                            <span className="min-w-0">{m.title}</span>
                            <span className="tabular shrink-0 text-xs text-ink-2">{n} Qs</span>
                          </Link>
                        ) : (
                          <p key={m.id} className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-ink-3">
                            <span className="min-w-0">{m.title}</span>
                            <span className="shrink-0 text-xs">No questions yet</span>
                          </p>
                        );
                      })}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
