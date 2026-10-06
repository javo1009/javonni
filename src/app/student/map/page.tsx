import type { Metadata } from "next";
import Link from "next/link";
import { LosStatusBadge } from "@/components/student/labels";
import { Card, CardBody, PageHeader, TableWrap, td, th } from "@/components/ui";
import { CurriculumMap } from "@/components/viz/curriculum-map";
import { MasteryLegend } from "@/components/viz/mastery";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { getStudentSnapshot, mapTopics } from "@/services/student-views";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage({ searchParams }: PageProps<"/student/map">) {
  const { actor, db, now } = await studentContext();
  const c = await getCurriculum();
  const view = (await searchParams).view === "list" ? "list" : "map";
  const { snap } = await getStudentSnapshot(db, actor, c, now);
  const topics = mapTopics(c, snap);

  const tab = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium sm:min-h-9",
      active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Curriculum map"
        description="Each tile is a topic, sized by its exam weight. Each square is one learning objective, coloured by how well you know it. Select a square to see why."
        actions={
          <nav aria-label="View" className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
            <Link href="/student/map" aria-current={view === "map" ? "page" : undefined} className={tab(view === "map")}>
              Map
            </Link>
            <Link href="/student/map?view=list" aria-current={view === "list" ? "page" : undefined} className={tab(view === "list")}>
              List
            </Link>
          </nav>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <MasteryLegend />
          <p className="tabular text-sm text-ink-2">
            {snap.coverage.covered} of {snap.coverage.total} started · {snap.coverage.proficient} proficient
            {snap.coverage.reviewDue > 0 && ` · ${snap.coverage.reviewDue} due for review`}
          </p>
        </CardBody>
      </Card>

      {view === "map" ? (
        <CurriculumMap topics={topics} hrefForLos={(id) => `/student/map/${id}`} />
      ) : (
        <div className="space-y-4">
          {topics.map((t) => (
            <TableWrap key={t.id} label={`${t.name} objectives`}>
              <table className="w-full">
                <caption className="px-4 pt-3 text-left text-sm font-semibold text-ink">
                  {t.name} <span className="tabular font-normal text-ink-2">· {t.weightMin}–{t.weightMax}% of exam · {pct(t.proficientPct)} proficient</span>
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={th}>
                      Objective
                    </th>
                    <th scope="col" className={th}>
                      Status
                    </th>
                    <th scope="col" className={cn(th, "text-right")}>
                      Mastery
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.los.map((l) => (
                    <tr key={l.id}>
                      <td className={td}>
                        <Link href={`/student/map/${l.id}`} className="font-medium text-brand hover:underline">
                          {l.code}
                        </Link>
                        <span className="mt-0.5 block text-ink-2 sm:ml-2 sm:mt-0 sm:inline">{l.text}</span>
                      </td>
                      <td className={cn(td, "max-sm:px-2")}>
                        <LosStatusBadge status={l.status} />
                      </td>
                      <td className={cn(td, "tabular text-right")}>{l.mastery > 0 ? pct(l.mastery) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ))}
        </div>
      )}
    </div>
  );
}
