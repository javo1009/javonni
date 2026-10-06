import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, X } from "lucide-react";
import { LosStatusBadge } from "@/components/student/labels";
import { ButtonLink, Card, CardBody, CardHeader, Stat } from "@/components/ui";
import { levelFromStatus, MasteryCell } from "@/components/viz/mastery";
import { LOS_STATUS_LABEL } from "@/domain/status";
import { cn } from "@/lib/cn";
import { formatDateTime, pct } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { getLosDetail } from "@/services/student-views";

export async function generateMetadata({ params }: PageProps<"/student/map/[losId]">): Promise<Metadata> {
  const { losId } = await params;
  const c = await getCurriculum();
  const l = c.los.find((x) => x.id === losId);
  return { title: l ? `${l.code} · Map` : "Objective" };
}

const MODE_LABEL: Record<string, string> = { practice: "Practice", timed: "Timed", mock: "Mock", homework: "Homework" };
const DIFF_LABEL: Record<number, string> = { 1: "easy", 2: "medium", 3: "hard" };

function evidenceLabel(e: number) {
  if (e < 0.5) return "Low";
  if (e < 3) return "Moderate";
  return "Strong";
}

export default async function LosPage({ params }: PageProps<"/student/map/[losId]">) {
  const { losId } = await params;
  const { user, actor, db, now } = await studentContext();
  const c = await getCurriculum();
  const d = await getLosDetail(db, actor, losId, { c, nowMs: now });
  if (!d) notFound();

  const practiceHref = d.questionCount > 0 ? `/student/practice/session?scope=los&id=${d.los.id}` : `/student/practice/session?scope=module&id=${d.module.id}`;
  const lastDays = d.daysSinceLast;

  return (
    <div className="space-y-5">
      <Link href="/student/map" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline sm:min-h-0">
        <ChevronLeft className="size-4" aria-hidden /> Curriculum map
      </Link>

      <header className="space-y-2">
        <p className="text-sm text-ink-2">
          {d.topic.name} · {d.module.title}
        </p>
        <div className="flex items-start gap-3">
          <MasteryCell level={levelFromStatus(d.status, d.mastery)} reviewDue={d.status === "review_due"} label={LOS_STATUS_LABEL[d.status]} className="mt-2 size-6!" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-snug tracking-tight text-ink sm:text-3xl">
            <span className="tabular">{d.los.code}</span> <span className="text-ink-2">·</span> {d.los.text}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LosStatusBadge status={d.status} />
          <span className="text-sm text-ink-2">Command word: {d.los.commandWord}</span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card aria-labelledby="why-h">
            <CardHeader id="why-h" title="Why this colour?" />
            <CardBody className="space-y-4">
              <p className="text-ink">{d.why}</p>
              {d.recent.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Last {d.recent.length} answers, newest first</p>
                  <ol className="flex flex-wrap gap-1.5" aria-label="Recent answers, newest first">
                    {d.recent.map((r, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-md border",
                          r.correct ? "border-good/40 bg-good-soft text-good" : "border-risk/40 bg-risk-soft text-risk",
                        )}
                        title={`${r.correct ? "Correct" : "Incorrect"} · ${formatDateTime(r.at, user.timezone)}`}
                      >
                        {r.correct ? <Check className="size-4" aria-hidden strokeWidth={3} /> : <X className="size-4" aria-hidden strokeWidth={3} />}
                        <span className="sr-only">{r.correct ? "Correct" : "Incorrect"}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-sm text-ink-2">Newer answers count more. Older ones fade over a few weeks, so practice keeps the colour honest.</p>
                </div>
              ) : (
                <p className="text-sm text-ink-2">No answers yet on this objective.</p>
              )}
            </CardBody>
          </Card>

          {d.recent.length > 0 && (
            <Card aria-labelledby="hist-h">
              <CardHeader id="hist-h" title="Answer history" />
              <CardBody>
                <ul className="divide-y divide-border">
                  {d.recent.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className={cn("inline-flex items-center gap-1.5 font-medium", r.correct ? "text-good" : "text-risk")}>
                        {r.correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                        {r.correct ? "Correct" : "Incorrect"}
                      </span>
                      <span className="text-ink-2">
                        {MODE_LABEL[r.mode] ?? r.mode} · {DIFF_LABEL[r.difficulty] ?? "medium"}
                      </span>
                      <span className="tabular text-ink-2">{formatDateTime(r.at, user.timezone)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Evidence">
          <Card>
            <CardBody className="grid grid-cols-2 gap-4 pt-4">
              <Stat label="Mastery" value={d.attempts > 0 ? pct(d.mastery) : "—"} />
              <Stat label="Evidence" value={evidenceLabel(d.evidence)} />
              <Stat label="Answers" value={d.attempts} hint={`on ${d.activeDays} day${d.activeDays === 1 ? "" : "s"}`} />
              <Stat label="Last practised" value={lastDays === null ? "Never" : lastDays === 0 ? "Today" : `${lastDays} d ago`} />
            </CardBody>
          </Card>
          <div className="space-y-2">
            <ButtonLink href={practiceHref} size="lg" className="w-full">
              Practise this objective
            </ButtonLink>
            <p className="text-center text-sm text-ink-2">
              {d.questionCount > 0
                ? `${d.questionCount} question${d.questionCount === 1 ? "" : "s"} available`
                : "No questions for this objective yet, so this practises its module."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
