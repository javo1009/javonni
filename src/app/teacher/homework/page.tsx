import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { listClasses } from "@/services/classes";
import { listTeacherAssignments } from "@/services/homework";

export const metadata: Metadata = { title: "Homework" };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ class?: string | string[] }> }) {
  const sp = await searchParams;
  const only = Array.isArray(sp.class) ? sp.class[0] : sp.class;
  const { actor, db, user, now } = await teacherContext();
  const all = await listClasses(db, actor);
  const classes = all.some((c) => c.id === only) ? all.filter((c) => c.id === only) : all;
  const sections = await Promise.all(classes.map(async (c) => ({ cls: c, rows: await listTeacherAssignments(db, actor, c.id) })));

  return (
    <>
      <PageHeader
        title="Homework"
        description="Assignments by class: who has handed in, what needs grading, and how they scored."
        actions={all.length > 0 ? <ButtonLink href={`/teacher/homework/new${only && classes.length === 1 ? `?class=${only}` : ""}`}>New homework</ButtonLink> : undefined}
      />
      {classes.length < all.length && (
        <p className="-mt-3 mb-4 text-sm text-ink-2">
          Showing one class.{" "}
          <Link href="/teacher/homework" className="text-brand hover:underline">
            Show all classes
          </Link>
        </p>
      )}
      {all.length === 0 && (
        <EmptyState title="No classes yet" action={<ButtonLink href="/teacher/classes#create">Create a class</ButtonLink>}>
          Homework is set per class. Create a class first.
        </EmptyState>
      )}
      <div className="space-y-8">
        {sections.map(({ cls, rows }) => (
          <section key={cls.id} aria-labelledby={`hw-${cls.id}`}>
            <h2 id={`hw-${cls.id}`} className="mb-3 text-lg font-semibold text-ink">
              {cls.name}
            </h2>
            {rows.length === 0 ? (
              <EmptyState
                title="No homework for this class yet"
                action={
                  <ButtonLink href={`/teacher/homework/new?class=${cls.id}`} variant="secondary">
                    Build the first one
                  </ButtonLink>
                }
              >
                Pick objectives, assemble questions from the bank, and assign it to the class or chosen students.
              </EmptyState>
            ) : (
              <TableWrap label={`Homework for ${cls.name}`}>
                <table className="relative w-full min-w-[56rem]">
                  <caption className="sr-only">Homework for {cls.name}</caption>
                  <thead className="border-b border-border">
                    <tr>
                      <th scope="col" className={th}>Title</th>
                      <th scope="col" className={th}>State</th>
                      <th scope="col" className={th}>Due</th>
                      <th scope="col" className={`${th} text-right`}>Targeted</th>
                      <th scope="col" className={`${th} text-right`}>Submitted</th>
                      <th scope="col" className={`${th} text-right`}>To grade</th>
                      <th scope="col" className={`${th} text-right`}>Late</th>
                      <th scope="col" className={`${th} text-right`}>Avg score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((a) => {
                      const pastDue = a.dueAt.getTime() < now;
                      return (
                        <tr key={a.id}>
                          <th scope="row" className={`${td} text-left font-medium`}>
                            <Link href={`/teacher/homework/${a.id}`} className="text-ink hover:underline">
                              {a.title}
                            </Link>
                          </th>
                          <td className={td}>
                            {a.status === "draft" ? <Badge>Draft</Badge> : <Badge tone={pastDue ? "neutral" : "brand"}>{pastDue ? "Assigned · past due" : "Assigned · open"}</Badge>}
                          </td>
                          <td className={`${td} tabular whitespace-nowrap`}>{formatDateTime(a.dueAt, user.timezone)}</td>
                          <td className={`${td} tabular text-right`}>{a.targeted}</td>
                          <td className={`${td} tabular text-right`}>
                            {a.submitted}
                            <span className="text-ink-2"> / {a.targeted}</span>
                          </td>
                          <td className={`${td} tabular text-right`}>
                            {a.needsGrading > 0 ? <span className="font-semibold text-warn">{a.needsGrading}</span> : <span className="text-ink-2">0</span>}
                          </td>
                          <td className={`${td} tabular text-right`}>{a.late}</td>
                          <td className={`${td} tabular text-right`}>{a.avgScorePct === null ? <span className="text-ink-3">—</span> : `${a.avgScorePct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
