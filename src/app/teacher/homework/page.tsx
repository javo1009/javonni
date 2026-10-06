import type { Metadata } from "next";
import Link from "next/link";
import { ClassPicker } from "@/components/homework/teacher/class-picker";
import { formatWhen, PHASE_LABEL, PHASE_TONE, phaseOf, relativeTime, type HomeworkPhase } from "@/components/homework/teacher/time";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, ProgressBar, StatusPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { listClasses } from "@/services/classes";
import { listAssignmentFiles } from "@/services/files";
import { listTeacherAssignments } from "@/services/homework";

export const metadata: Metadata = { title: "Homework · Ascent" };

const TABS = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["open", "Open"],
  ["closed", "Closed"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function HomeworkListPage({ searchParams }: PageProps<"/teacher/homework">) {
  const { actor, db, user, now } = await teacherContext();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const classes = await listClasses(db, actor);
  if (classes.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Homework" title="Homework" />
        <EmptyState title="No classes yet" action={<ButtonLink href="/teacher/classes">Create a class</ButtonLink>}>
          Homework is assigned to a class. Create one first, then share its join code with your students.
        </EmptyState>
      </>
    );
  }
  const cls = classes.find((c) => c.id === one(sp.class)) ?? classes[0];
  const tab: Tab = TABS.some(([k]) => k === one(sp.tab)) ? (one(sp.tab) as Tab) : "all";

  const all = await listTeacherAssignments(db, actor, cls.id);
  const fileCounts = await Promise.all(all.map(async (a) => (await listAssignmentFiles(db, a.id)).length));
  const rows = all.map((a, i) => ({ ...a, phase: phaseOf(a, now) as HomeworkPhase, handouts: fileCounts[i] }));
  const counts: Record<Tab, number> = {
    all: rows.length,
    draft: rows.filter((r) => r.phase === "draft").length,
    open: rows.filter((r) => r.phase === "open").length,
    closed: rows.filter((r) => r.phase === "closed").length,
  };
  const order = { draft: 0, open: 1, closed: 2 } as const;
  const shown = rows
    .filter((r) => tab === "all" || r.phase === tab)
    .sort((a, b) => order[a.phase] - order[b.phase] || (a.phase === "closed" ? b.dueAt.getTime() - a.dueAt.getTime() : a.dueAt.getTime() - b.dueAt.getTime()));
  const toMark = rows.reduce((s, r) => s + r.needsGrading, 0);
  const markingHomework = rows.filter((r) => r.needsGrading > 0).length;

  const href = (t: Tab) => `/teacher/homework?class=${cls.id}${t === "all" ? "" : `&tab=${t}`}`;

  return (
    <>
      <PageHeader
        eyebrow={cls.name}
        title="Homework"
        description="Upload a handout, students complete it and upload their work, you mark it and send feedback back."
        actions={<ButtonLink href={`/teacher/homework/new?class=${cls.id}`}>+ New homework</ButtonLink>}
      />

      {toMark > 0 && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-warn">
          <span className="font-medium">
            <strong className="tabular">{plural(toMark, "submission")}</strong> waiting to be marked across {plural(markingHomework, "homework", "homework")}.
          </span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter homework" className="flex flex-wrap gap-2">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={href(k)}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold max-sm:h-11",
                tab === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface-2 text-ink-2 hover:text-ink",
              )}
            >
              {label}
              <span className="tabular text-xs opacity-80">{counts[k]}</span>
            </Link>
          ))}
        </nav>
        <ClassPicker classes={classes.map((c) => ({ id: c.id, name: c.name }))} value={cls.id} />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No homework yet" : `No ${tab} homework`}
          action={rows.length === 0 ? <ButtonLink href={`/teacher/homework/new?class=${cls.id}`}>Create the first homework</ButtonLink> : <ButtonLink variant="secondary" href={href("all")}>Show all</ButtonLink>}
        >
          {rows.length === 0 ? "Upload a worksheet, assign it to the class, and mark the work students send back." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className="space-y-3 pb-4">
          {shown.map((a) => (
            <li key={a.id}>
              <Card className="p-4 sm:p-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusPill tone={PHASE_TONE[a.phase]} label={PHASE_LABEL[a.phase]} />
                      {a.late > 0 && <Badge tone="warn">{a.late} late</Badge>}
                    </div>
                    <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-ink">
                      <Link href={`/teacher/homework/${a.id}`} className="hover:underline">
                        {a.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-ink-2">
                      {a.phase === "draft" ? "Due" : a.phase === "open" ? "Due" : "Was due"} {formatWhen(a.dueAt, user.timezone)} ·{" "}
                      <span suppressHydrationWarning>{relativeTime(a.dueAt, now)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-2">
                      {a.handouts ? plural(a.handouts, "handout file") : "No handout"}
                      {a.target.kind === "students" ? ` · ${plural(a.targeted, "chosen student")}` : ""}
                    </p>
                  </div>

                  <div className="min-w-0">
                    {a.phase === "draft" ? (
                      <p className="text-sm text-ink-2">Not visible to students yet.</p>
                    ) : (
                      <>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-ink-2">Handed in</span>
                          <span className="tabular font-semibold text-ink">
                            {a.submitted} / {a.targeted}
                          </span>
                        </div>
                        <ProgressBar value={a.submitted} max={Math.max(1, a.targeted)} label={`${a.title}: handed in`} />
                        <p className="mt-2 text-sm text-ink-2">
                          {a.avgScorePct === null ? "No marks yet" : (
                            <>
                              Average <strong className="tabular text-ink">{a.avgScorePct}%</strong>
                            </>
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 md:flex-col md:items-end">
                    {a.needsGrading > 0 ? (
                      <ButtonLink href={`/teacher/homework/${a.id}#students`} size="md" className="bg-warn text-canvas hover:bg-warn hover:brightness-110">
                        {a.needsGrading} to mark
                      </ButtonLink>
                    ) : a.phase !== "draft" && a.submitted > 0 ? (
                      <Badge tone="good">All marked</Badge>
                    ) : null}
                    <ButtonLink href={`/teacher/homework/${a.id}`} variant="secondary" size="md">
                      {a.phase === "draft" ? "Open draft" : "Open"}
                    </ButtonLink>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
