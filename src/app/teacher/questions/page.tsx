import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { teacherContext } from "@/server/context";
import { getQuestionBank, isUuid } from "@/services/teacher-views";

export const metadata: Metadata = { title: "Question bank" };

const DIFFICULTY: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[]; los?: string | string[]; gaps?: string | string[] }> }) {
  const sp = await searchParams;
  const topicParam = one(sp.topic);
  const losParam = one(sp.los);
  const gapsOnly = one(sp.gaps) === "1";
  const { actor, db } = await teacherContext();
  const bank = await getQuestionBank(db, actor, {
    topicId: isUuid(topicParam) ? topicParam : undefined,
    losId: isUuid(losParam) ? losParam : undefined,
  });
  const { tree, totals } = bank;
  const topicId = bank.topicId ?? (gapsOnly ? null : tree[0]?.id ?? null);
  const shownTopics = gapsOnly ? tree : tree.filter((t) => t.id === topicId);

  return (
    <>
      <PageHeader title="Question bank" description="Published questions by topic and learning objective. Read-only for now; an admin manages authoring." />

      <Card className="mb-6">
        <CardBody className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4">
          <Stat label="Published questions" value={totals.questions} />
          <Stat label="Objectives" value={totals.los} />
          <Stat label="With questions" value={`${totals.withQuestions} / ${totals.los}`} />
          <Stat
            label="No questions"
            value={totals.los - totals.withQuestions}
            tone={totals.los - totals.withQuestions > 0 ? "warn" : undefined}
            hint={
              totals.los - totals.withQuestions > 0 ? (
                <Link href="/teacher/questions?gaps=1" className="text-brand hover:underline">
                  Show gaps
                </Link>
              ) : undefined
            }
          />
        </CardBody>
      </Card>

      <nav aria-label="Topics" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {tree.map((t) => {
            const los = t.modules.flatMap((m) => m.los);
            const gaps = los.filter((l) => l.questions === 0).length;
            const current = !gapsOnly && t.id === topicId;
            return (
              <li key={t.id}>
                <Link
                  href={`/teacher/questions?topic=${t.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                    current ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border bg-surface text-ink hover:bg-surface-2",
                  )}
                  title={t.name}
                >
                  {t.code}
                  <span className="tabular text-xs text-ink-2">{los.reduce((s, l) => s + l.questions, 0)} Q</span>
                  {gaps > 0 && <span className="text-xs font-medium text-warn">· {gaps} gap{gaps === 1 ? "" : "s"}</span>}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/teacher/questions?gaps=1"
              aria-current={gapsOnly ? "page" : undefined}
              className={cn(
                "flex items-center rounded-full border px-3 py-1.5 text-sm",
                gapsOnly ? "border-warn bg-warn-soft font-semibold text-warn" : "border-dashed border-border-strong text-ink-2 hover:text-ink",
              )}
            >
              Only objectives without questions
            </Link>
          </li>
        </ul>
      </nav>

      <div className={cn("grid gap-6", bank.los && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="min-w-0 space-y-6">
          {shownTopics.map((t) => {
            const rows = t.modules.map((m) => ({ ...m, los: gapsOnly ? m.los.filter((l) => l.questions === 0) : m.los })).filter((m) => m.los.length > 0);
            if (gapsOnly && rows.length === 0) return null;
            return (
              <section key={t.id} aria-labelledby={`t-${t.id}`}>
                <h2 id={`t-${t.id}`} className="mb-3 text-lg font-semibold text-ink">
                  {t.name}
                </h2>
                <TableWrap label={`Objectives in ${t.name}`}>
                  <table className="relative w-full min-w-[34rem]">
                    <caption className="sr-only">Question counts per objective in {t.name}</caption>
                    <thead className="border-b border-border">
                      <tr>
                        <th scope="col" className={th}>Objective</th>
                        <th scope="col" className={`${th} text-right`}>Questions</th>
                      </tr>
                    </thead>
                    {rows.map((m) => (
                      <tbody key={m.id} className="divide-y divide-border border-b border-border last:border-b-0">
                        <tr className="bg-surface-2">
                          <th scope="colgroup" colSpan={2} className="px-4 py-2 text-left text-xs font-semibold text-ink-2">
                            {m.title}
                          </th>
                        </tr>
                        {m.los.map((l) => {
                          const current = bank.los?.id === l.id;
                          return (
                            <tr key={l.id} className={cn(current && "bg-brand-soft")}>
                              <th scope="row" className={`${td} text-left font-normal`}>
                                {l.questions > 0 ? (
                                  <Link href={`/teacher/questions?los=${l.id}`} className="hover:underline" aria-current={current ? "true" : undefined}>
                                    <span className="font-semibold text-ink">{l.code}</span> <span className="text-ink-2">{l.text}</span>
                                  </Link>
                                ) : (
                                  <>
                                    <span className="font-semibold text-ink">{l.code}</span> <span className="text-ink-2">{l.text}</span>
                                  </>
                                )}
                              </th>
                              <td className={`${td} tabular text-right`}>
                                {l.questions > 0 ? l.questions : <Badge tone="warn">None</Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </TableWrap>
              </section>
            );
          })}
          {gapsOnly && totals.withQuestions === totals.los && <EmptyState title="Every objective has at least one question" />}
        </div>

        {bank.los && (
          <Card aria-labelledby="qlist-h" className="self-start xl:sticky xl:top-6">
            <CardHeader
              id="qlist-h"
              title={`${bank.los.code} · ${bank.questions.length} question${bank.questions.length === 1 ? "" : "s"}`}
              subtitle={bank.los.text}
              action={
                <Link href={`/teacher/questions?topic=${bank.topicId}`} className="text-sm text-brand hover:underline">
                  Close
                </Link>
              }
            />
            <CardBody>
              <ol className="space-y-4">
                {bank.questions.map((q, i) => (
                  <li key={q.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <Badge>{DIFFICULTY[q.difficulty] ?? "Medium"}</Badge>
                      {!q.isPrimary && <Badge>Secondary objective</Badge>}
                    </div>
                    <p className="text-sm text-ink">
                      <span className="mr-1.5 font-semibold text-ink-2">{i + 1}.</span>
                      {q.stem}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.options.map((o) => (
                        <li key={o.key} className={o.key === q.correctKey ? "font-medium text-good" : "text-ink"}>
                          {o.key}. {o.text}
                          {o.key === q.correctKey && <span className="ml-1 text-xs">✓ correct</span>}
                        </li>
                      ))}
                    </ul>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-brand hover:underline">Explanation</summary>
                      <p className="mt-1 text-ink-2">{q.explanation}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
