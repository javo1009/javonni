import type { Metadata } from "next";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import {
  HomeworkCard,
  type HomeworkCardData,
} from "@/components/homework/student/homework-card";
import { studentContext } from "@/server/context";
import {
  getAssignmentForStudent,
  listStudentAssignments,
} from "@/services/homework";

export const metadata: Metadata = { title: "Homework" };

export default async function HomeworkPage() {
  const { actor, db, user, now: nowMs } = await studentContext();
  const now = new Date(nowMs);
  const list = await listStudentAssignments(db, actor, now);

  // Per-card extras (what kind of work, how many handout files, late policy) come from the same service the detail page uses.
  const cards: HomeworkCardData[] = await Promise.all(
    list.map(async (a) => {
      const d = await getAssignmentForStudent(db, actor, a.id, now);
      return {
        id: a.id,
        title: a.title,
        className: a.className,
        dueAt: a.dueAt,
        status: a.status,
        overdue: a.overdue,
        late: a.late,
        score: a.score,
        maxScore: a.maxScore,
        kinds: d.items.map((i) => i.kind),
        handoutCount: d.attachments.length,
        allowLate: d.assignment.policies.allowLate,
      };
    }),
  );

  const todo = cards
    .filter((c) => c.status === "not_started" || c.status === "in_progress")
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const waiting = cards
    .filter((c) => c.status === "submitted")
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  const marked = cards
    .filter((c) => c.status === "graded")
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  const overdue = todo.filter((c) => c.overdue).length;
  const scored = marked.filter((c) => c.score !== null && c.maxScore);
  const avg = scored.length
    ? Math.round(
        (scored.reduce((s, c) => s + c.score! / c.maxScore!, 0) /
          scored.length) *
          100,
      )
    : null;

  const section = (
    id: string,
    title: string,
    items: HomeworkCardData[],
    hint?: string,
  ) => (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id={id} className="text-xl font-semibold tracking-tight text-ink">
          {title}
          <span className="ml-2 tabular text-base font-medium text-ink-2">
            {items.length}
          </span>
        </h2>
        {hint && <p className="text-sm text-ink-2">{hint}</p>}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={id === "todo" ? "You're all caught up" : "Nothing here yet"}
        >
          {id === "todo"
            ? "No homework waiting for you right now."
            : id === "waiting"
              ? "Work you hand in will wait here until your teacher marks it."
              : "Marked homework and your teacher's feedback will appear here."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {items.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              now={now}
              timeZone={user.timezone}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow="Homework"
        title="Your homework"
        description="Download the handout, do the work, then upload your completed files for your teacher to mark."
      />

      {cards.length === 0 ? (
        <EmptyState title="No homework yet">
          When your teacher sets homework for your class it will show up here,
          with the files you need.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-3 gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-5">
            <Stat
              label="To do"
              value={todo.length}
              hint={overdue ? `${overdue} overdue` : "none overdue"}
              tone={overdue ? "risk" : undefined}
            />
            <Stat label="Waiting for marking" value={waiting.length} />
            <Stat
              label="Average mark"
              value={avg === null ? "–" : `${avg}%`}
              hint={
                scored.length
                  ? `across ${scored.length} marked`
                  : "nothing marked yet"
              }
            />
          </div>
          {section(
            "todo",
            "To do",
            todo,
            overdue ? "Overdue work is listed first." : undefined,
          )}
          {section("waiting", "Waiting for marking", waiting)}
          {section("marked", "Marked", marked)}
        </div>
      )}
    </div>
  );
}
