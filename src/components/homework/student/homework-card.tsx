import Link from "next/link";
import { Clock, Paperclip, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { StudentHomeworkStatus } from "@/services/homework";
import { describeDue, formatDue, summarizeItems, type ItemKind } from "./due";
import { HomeworkStatus } from "./status";

export type HomeworkCardData = {
  id: string;
  title: string;
  className: string;
  dueAt: Date;
  status: StudentHomeworkStatus;
  overdue: boolean;
  late: boolean;
  score: number | null;
  maxScore: number | null;
  kinds: ItemKind[];
  handoutCount: number;
  allowLate: boolean;
};

export function HomeworkCard({ hw, now, timeZone }: { hw: HomeworkCardData; now: Date; timeZone: string }) {
  const done = hw.status === "submitted" || hw.status === "graded";
  const due = describeDue(hw.dueAt, now);
  const urgent = !done && due.overdue;
  const closed = urgent && !hw.allowLate;
  const scorePct = hw.score !== null && hw.maxScore ? Math.round((hw.score / hw.maxScore) * 100) : null;

  return (
    <li
      className={cn(
        "relative rounded-[var(--radius-card)] border bg-surface p-4 shadow-[var(--shadow)] transition hover:border-border-strong sm:p-5",
        urgent ? "border-risk/50" : "border-border",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-2">{hw.className}</p>
          <h3 className="mt-0.5 text-lg font-semibold leading-snug tracking-tight text-ink">
            <Link href={`/student/homework/${hw.id}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:underline">
              {hw.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {summarizeItems(hw.kinds)}
            {hw.handoutCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-ink-2">
                <Paperclip aria-hidden className="size-3.5" />
                {hw.handoutCount} {hw.handoutCount === 1 ? "handout file" : "handout files"}
              </span>
            )}
          </p>
          <div className="mt-3">
            <HomeworkStatus status={hw.status} overdue={hw.overdue} late={hw.late} />
          </div>
        </div>

        <div className="shrink-0 sm:text-right">
          {hw.status === "graded" && scorePct !== null ? (
            <p className="tabular text-3xl font-bold leading-none tracking-[-0.04em] text-ink">
              {hw.score}
              <span className="text-lg font-semibold text-ink-2">/{hw.maxScore}</span>
              <span className="mt-1 block text-sm font-semibold tracking-normal text-ink-2">{scorePct}%</span>
            </p>
          ) : (
            <>
              <p className={cn("flex items-center gap-1.5 text-sm font-semibold sm:justify-end", urgent ? "text-risk" : "text-ink")}>
                {urgent ? <TriangleAlert aria-hidden className="size-4" /> : <Clock aria-hidden className="size-4 text-ink-2" />}
                {done ? "Was due" : due.label.charAt(0).toUpperCase() + due.label.slice(1)}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                {done ? "" : "Due "}
                {formatDue(hw.dueAt, timeZone)}
              </p>
              {!done && (
                <p className="mt-1.5 text-xs text-ink-2">
                  {closed ? (
                    <Badge tone="risk">Closed: late work isn&apos;t accepted</Badge>
                  ) : hw.allowLate ? (
                    "Late work is accepted"
                  ) : (
                    "No late work after the deadline"
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
