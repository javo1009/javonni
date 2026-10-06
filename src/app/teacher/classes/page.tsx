import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { CopyButton } from "@/components/teacher/copy-button";
import { CreateClassForm } from "@/components/teacher/create-class-form";
import { formatShortDate } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { listClasses } from "@/services/classes";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const { actor, db } = await teacherContext();
  const classes = await listClasses(db, actor);
  return (
    <>
      <PageHeader title="Classes" description="Your classes, their join codes and rosters." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {classes.length === 0 ? (
            <EmptyState title="No classes yet">Create your first class with the form. You&apos;ll get a join code to share with students.</EmptyState>
          ) : (
            <TableWrap label="Classes">
              <table className="relative w-full">
                <caption className="sr-only">Your classes</caption>
                <thead className="border-b border-border">
                  <tr>
                    <th scope="col" className={th}>Class</th>
                    <th scope="col" className={`${th} text-right`}>Students</th>
                    <th scope="col" className={th}>Exam</th>
                    <th scope="col" className={th}>Join code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" className={`${td} text-left font-medium`}>
                        <Link href={`/teacher/classes/${c.id}`} className="text-ink hover:underline">
                          {c.name}
                        </Link>
                        <span className="block text-xs font-normal text-ink-2">
                          <Link href={`/teacher?class=${c.id}`} className="hover:underline">
                            Open cockpit
                          </Link>
                        </span>
                      </th>
                      <td className={`${td} tabular text-right`}>{c.students}</td>
                      <td className={td}>{c.examDate ? formatShortDate(c.examDate) : <span className="text-ink-3">Not set</span>}</td>
                      <td className={td}>
                        <span className="flex items-center gap-2">
                          <code className="font-mono font-semibold tracking-[0.15em]">{c.joinCode}</code>
                          <CopyButton value={c.joinCode} label={`Copy join code for ${c.name}`} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
        <Card id="create" aria-labelledby="create-h" className="scroll-mt-20 self-start">
          <CardHeader id="create-h" title="Create a class" />
          <CardBody>
            <CreateClassForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
