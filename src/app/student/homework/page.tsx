import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { dueText, HomeworkStatusChip } from "@/components/student/labels";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { studentContext } from "@/server/context";
import { listStudentAssignments } from "@/services/homework";

export const metadata: Metadata = { title: "Homework" };

type Row = Awaited<ReturnType<typeof listStudentAssignments>>[number];

function HomeworkRow({ h, timezone, now }: { h: Row; timezone: string; now: number }) {
  const open = h.status === "not_started" || h.status === "in_progress";
  return (
    <li>
      <Link href={`/student/homework/${h.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{h.title}</span>
          <span className="mt-0.5 block text-sm text-ink-2">
            {h.className} · {h.itemCount} item{h.itemCount === 1 ? "" : "s"} · Due {formatDateTime(h.dueAt, timezone)}
            {open && <span className={h.overdue ? "font-medium text-risk" : undefined}> ({dueText(h.dueAt, now)})</span>}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <HomeworkStatusChip status={h.status} />
            {h.overdue && <Badge tone="risk">Overdue</Badge>}
            {h.late && <Badge tone="warn">Submitted late</Badge>}
          </span>
        </span>
        {h.status === "graded" && h.score !== null && h.maxScore ? (
          <span className="tabular shrink-0 text-right">
            <span className="block text-lg font-semibold text-ink">
              {h.score}/{h.maxScore}
            </span>
            <span className="block text-xs text-ink-2">{Math.round((h.score / h.maxScore) * 100)}%</span>
          </span>
        ) : null}
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

export default async function HomeworkPage() {
  const { user, actor, db, now } = await studentContext();
  const all = await listStudentAssignments(db, actor, new Date(now));
  const open = all.filter((h) => h.status === "not_started" || h.status === "in_progress");
  const done = all.filter((h) => h.status === "submitted" || h.status === "graded").sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="Homework" description="Work from your teacher, soonest deadline first. Multiple-choice items are marked as soon as you submit." />
      {all.length === 0 ? (
        <EmptyState title="No homework yet">Your teacher will post it here. In the meantime, a practice set keeps things moving.</EmptyState>
      ) : (
        <>
          <section aria-labelledby="open-h">
            <h2 id="open-h" className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
              To do · {open.length}
            </h2>
            {open.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-ink-2">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                {open.map((h) => (
                  <HomeworkRow key={h.id} h={h} timezone={user.timezone} now={now} />
                ))}
              </ul>
            )}
          </section>
          {done.length > 0 && (
            <section aria-labelledby="done-h">
              <h2 id="done-h" className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
                Submitted and graded · {done.length}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                {done.map((h) => (
                  <HomeworkRow key={h.id} h={h} timezone={user.timezone} now={now} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
