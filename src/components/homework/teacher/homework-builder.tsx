"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createHomework, publishHomework, uploadHandout } from "@/app/actions/teacher";
import type { QuestionPreview } from "@/app/actions/teacher-homework";
import { Badge, Button, Card, CardBody, CardHeader, Eyebrow, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import type { ClassOption, TopicOption } from "./builder-types";
import { DropZone, FileRow, Spinner, type UploadStatus } from "./file-drop";
import { fileProblem, formatBytes, MAX_HANDOUTS } from "./file-rules";
import { QuestionPicker } from "./question-picker";
import { formatWhen, relativeTime } from "./time";

type Item = { key: string; kind: "file" | "text"; prompt: string; points: string };
type Queued = { key: string; file: File; status: UploadStatus; error: string | null };
type ShowAnswers = "never" | "after_due" | "immediately";

const firstItem = (): Item => ({ key: "k0", kind: "file", prompt: "Upload your completed worksheet", points: "10" });

const noopSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Local date + time inputs -> a Date in the teacher's device time zone (NaN if blank/invalid). */
function dueFrom(date: string, time: string) {
  if (!date || !time) return new Date(NaN);
  return new Date(`${date}T${time}:00`);
}

export function HomeworkBuilder({
  classes,
  topics,
  defaultClassId,
  defaultDate,
  presetModuleId,
}: {
  classes: ClassOption[];
  topics: TopicOption[];
  defaultClassId: string;
  defaultDate: string;
  presetModuleId?: string;
}) {
  const router = useRouter();
  const uid = useId();
  // Keys only need to be unique within this form; a per-instance counter keeps server and client output identical.
  const keySeq = useRef(0);
  const nextKey = () => `k${++keySeq.current}`;
  const [classId, setClassId] = useState(defaultClassId);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [dueTime, setDueTime] = useState("17:00");
  const [targetKind, setTargetKind] = useState<"class" | "students">("class");
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set());
  const [queued, setQueued] = useState<Queued[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [items, setItems] = useState<Item[]>(() => [firstItem()]);
  const [mcq, setMcq] = useState<QuestionPreview[]>([]);
  const [mcqOpen, setMcqOpen] = useState(!!presetModuleId);
  const [mcqPoints, setMcqPoints] = useState("1");
  const [showAnswers, setShowAnswers] = useState<ShowAnswers>("after_due");
  const [allowLate, setAllowLate] = useState(true);

  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<null | "saving" | "uploading" | "publishing">(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [intent, setIntent] = useState<"draft" | "assign">("draft");
  const wantAssign = intent === "assign";
  const formRef = useRef<HTMLFormElement>(null);

  const zone = useSyncExternalStore(noopSubscribe, browserZone, () => "");
  const cls = classes.find((c) => c.id === classId);
  const roster = cls?.students ?? [];
  const locked = busy !== null || draftId !== null;

  // ---------------------------------------------------------------- validation
  const due = dueFrom(dueDate, dueTime);
  const dueValid = !Number.isNaN(due.getTime());
  const errors = {
    classId: classId ? null : "Choose a class.",
    title: title.trim().length < 3 ? "Give the homework a title (at least 3 characters)." : title.trim().length > 120 ? "Keep the title to 120 characters or fewer." : null,
    instructions: instructions.length > 4000 ? "Keep the instructions under 4,000 characters." : null,
    due: !dueValid ? "Pick a due date and time." : null,
    dueFuture: dueValid && due.getTime() <= Date.now() ? "To assign it now, the due date must be in the future." : null,
    students: targetKind === "students" && studentIds.size === 0 ? "Choose at least one student, or switch to the whole class." : null,
    items: items.length + mcq.length === 0 ? "Add at least one thing for students to hand in." : null,
  };
  const itemErrors = new Map(
    items.map((it) => {
      const p = it.prompt.trim();
      const min = it.kind === "file" ? 3 : 5;
      const pts = Number(it.points);
      return [
        it.key,
        {
          prompt: p.length < min ? (it.kind === "file" ? "Say what students should upload (at least 3 characters)." : "Write the question (at least 5 characters).") : it.prompt.length > 2000 ? "Keep it under 2,000 characters." : null,
          points: !Number.isInteger(pts) || pts < 1 || pts > 20 ? "Points must be a whole number from 1 to 20." : null,
        },
      ] as const;
    }),
  );
  const mcqPointsError = mcq.length && (!Number.isInteger(Number(mcqPoints)) || Number(mcqPoints) < 1 || Number(mcqPoints) > 20) ? "Points must be a whole number from 1 to 20." : null;
  const baseProblems: string[] = [
    errors.classId,
    errors.title,
    errors.instructions,
    errors.due,
    errors.students,
    errors.items,
    mcqPointsError,
    ...[...itemErrors.values()].flatMap((e) => [e.prompt, e.points]),
  ].filter((x): x is string => !!x);
  const problemsFor = (assign: boolean) => (assign && errors.dueFuture ? [...baseProblems, errors.dueFuture] : baseProblems);

  const totalPoints = items.reduce((s, it) => s + (Number(it.points) || 0), 0) + mcq.length * (Number(mcqPoints) || 0);
  const show = (msg: string | null | undefined) => (showErrors ? (msg ?? null) : null);

  // ---------------------------------------------------------------- files
  function addFiles(list: File[]) {
    const bad: { name: string; reason: string }[] = [];
    const good: Queued[] = [];
    for (const f of list) {
      const problem = fileProblem(f);
      if (problem) bad.push({ name: f.name, reason: problem });
      else if (queued.some((q) => q.file.name === f.name && q.file.size === f.size) || good.some((q) => q.file.name === f.name && q.file.size === f.size)) bad.push({ name: f.name, reason: "Already added." });
      else if (queued.length + good.length >= MAX_HANDOUTS) bad.push({ name: f.name, reason: `A homework can have at most ${MAX_HANDOUTS} files.` });
      else good.push({ key: nextKey(), file: f, status: "queued", error: null });
    }
    setRejected(bad);
    if (good.length) {
      setQueued((q) => [...q, ...good]);
      setStatus(`${plural(good.length, "file")} added.`);
    }
  }

  // ---------------------------------------------------------------- submit
  const patchFile = (key: string, patch: Partial<Queued>) => setQueued((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function submit(assign: boolean) {
    setIntent(assign ? "assign" : "draft");
    setFormError(null);
    setShowErrors(true);
    const problems = problemsFor(assign);
    if (problems.length) {
      setStatus(`${plural(problems.length, "thing")} to fix before saving.`);
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }
    let id = draftId;
    if (!id) {
      setBusy("saving");
      setStatus("Saving draft…");
      const r = await createHomework({
        classId,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        dueAt: due.toISOString(),
        target: targetKind === "class" ? { kind: "class" } : { kind: "students", studentIds: [...studentIds] },
        policies: { showAnswers: mcq.length ? showAnswers : "after_due", allowLate },
        items: [
          ...items.map((it) => ({ kind: it.kind, prompt: it.prompt.trim(), points: Number(it.points) })),
          ...mcq.map((q) => ({ kind: "mcq" as const, questionId: q.id, points: Number(mcqPoints) })),
        ],
        assign: false,
      });
      if (!r.ok) {
        setBusy(null);
        setFormError(r.error);
        setStatus(`Could not save: ${r.error}`);
        return;
      }
      id = r.data.id;
      setDraftId(id);
    }

    const pending = queued.filter((q) => q.status !== "done");
    let failed = 0;
    if (pending.length) {
      setBusy("uploading");
      for (const [n, q] of pending.entries()) {
        patchFile(q.key, { status: "uploading", error: null });
        setStatus(`Uploading ${q.file.name} (${n + 1} of ${pending.length})…`);
        try {
          const fd = new FormData();
          fd.set("assignmentId", id);
          fd.set("file", q.file);
          const r = await uploadHandout(fd);
          if (r.ok) patchFile(q.key, { status: "done" });
          else {
            failed++;
            patchFile(q.key, { status: "error", error: r.error });
          }
        } catch {
          failed++;
          patchFile(q.key, { status: "error", error: "The upload failed. Check your connection and try again." });
        }
      }
    }
    if (failed) {
      setBusy(null);
      setFormError(
        `Your draft is saved, but ${plural(failed, "file")} didn't upload. ${assign ? "It hasn't been assigned yet. " : ""}Retry the failed uploads below, or open the draft and add the files there.`,
      );
      setStatus(`${plural(failed, "file")} failed to upload.`);
      return;
    }

    if (assign) {
      setBusy("publishing");
      setStatus("Assigning to students…");
      const r = await publishHomework(id);
      if (!r.ok) {
        setBusy(null);
        setFormError(`Your draft is saved, but it couldn't be assigned: ${r.error}`);
        setStatus("Could not assign.");
        return;
      }
    }
    setStatus(assign ? "Assigned." : "Draft saved.");
    router.push(`/teacher/homework/${id}`);
  }

  // ---------------------------------------------------------------- items
  const patchItem = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const moveItem = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const busyLabel = busy === "saving" ? "Saving…" : busy === "uploading" ? "Uploading files…" : busy === "publishing" ? "Assigning…" : null;
  const uploadedDone = queued.filter((q) => q.status === "done").length;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
    >
      <div className="min-w-0 space-y-6">
        {draftId && (
          <div role="status" className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
            <p className="font-semibold">Draft saved{formError ? " — needs attention" : ""}</p>
            <p className="mt-0.5">
              The form is locked because the draft already exists.{" "}
              <Link href={`/teacher/homework/${draftId}`} className="font-semibold underline underline-offset-2">
                Open the draft
              </Link>{" "}
              to review it, add files or assign it.
            </p>
          </div>
        )}

        <fieldset disabled={locked} className="min-w-0 space-y-6">
          {/* 1 · Basics */}
          <Card aria-labelledby={`${uid}-basics`}>
            <CardHeader id={`${uid}-basics`} title="1 · The basics" subtitle="Who it's for, what it's called and when it's due." />
            <CardBody className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-class`} className="block text-sm font-medium text-ink">
                  Class
                </label>
                <Select
                  id={`${uid}-class`}
                  value={classId}
                  aria-invalid={!!show(errors.classId)}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setStudentIds(new Set());
                  }}
                >
                  {classes.length === 0 && <option value="">No classes yet</option>}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({plural(c.students.length, "student")})
                    </option>
                  ))}
                </Select>
                {show(errors.classId) && (
                  <p role="alert" className="text-sm text-risk">
                    {errors.classId}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${uid}-title`} className="block text-sm font-medium text-ink">
                  Title
                </label>
                <Input
                  id={`${uid}-title`}
                  value={title}
                  maxLength={120}
                  placeholder="e.g. Time value of money worksheet"
                  aria-invalid={!!show(errors.title)}
                  aria-describedby={show(errors.title) ? `${uid}-title-err` : undefined}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {show(errors.title) && (
                  <p id={`${uid}-title-err`} role="alert" className="text-sm text-risk">
                    {errors.title}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${uid}-instr`} className="block text-sm font-medium text-ink">
                  Instructions <span className="font-normal text-ink-2">(optional)</span>
                </label>
                <Textarea
                  id={`${uid}-instr`}
                  value={instructions}
                  rows={4}
                  placeholder="What to do, which chapters to revise, how you'll mark it…"
                  aria-invalid={!!show(errors.instructions)}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                <p className="text-right text-xs text-ink-3">{instructions.length} / 4000</p>
                {show(errors.instructions) && (
                  <p role="alert" className="text-sm text-risk">
                    {errors.instructions}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span id={`${uid}-due-l`} className="block text-sm font-medium text-ink">
                  Due
                </span>
                <div role="group" aria-labelledby={`${uid}-due-l`} className="flex flex-wrap gap-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <label htmlFor={`${uid}-date`} className="sr-only">
                      Due date
                    </label>
                    <Input id={`${uid}-date`} type="date" value={dueDate} aria-invalid={!!show(errors.due ?? errors.dueFuture)} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                  <div className="w-36 max-sm:flex-1">
                    <label htmlFor={`${uid}-time`} className="sr-only">
                      Due time
                    </label>
                    <Input id={`${uid}-time`} type="time" value={dueTime} aria-invalid={!!show(errors.due)} onChange={(e) => setDueTime(e.target.value)} />
                  </div>
                </div>
                <p className="text-sm text-ink-2">
                  {dueValid ? (
                    <>
                      <span suppressHydrationWarning>{relativeTime(due)}</span>
                      {zone && <> · {zone} (this device&apos;s time zone)</>}
                    </>
                  ) : (
                    "Times use this device's time zone."
                  )}
                </p>
                {show(errors.due) && (
                  <p role="alert" className="text-sm text-risk">
                    {errors.due}
                  </p>
                )}
                {showErrors && wantAssign && errors.dueFuture && (
                  <p role="alert" className="text-sm text-risk">
                    {errors.dueFuture}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <span id={`${uid}-who`} className="block text-sm font-medium text-ink">
                  Who is it for
                </span>
                <div role="radiogroup" aria-labelledby={`${uid}-who`} className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["class", "Whole class", `${plural(roster.length, "student")} now, plus anyone who joins before the due date`],
                      ["students", "Choose students", "Only the students you tick"],
                    ] as const
                  ).map(([v, label, hint]) => (
                    <label
                      key={v}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 max-sm:min-h-11",
                        targetKind === v ? "border-brand bg-brand-soft" : "border-border bg-surface-2 hover:border-border-strong",
                      )}
                    >
                      <input type="radio" name={`${uid}-who`} className="mt-1 size-4" checked={targetKind === v} onChange={() => setTargetKind(v)} />
                      <span>
                        <span className="block font-semibold text-ink">{label}</span>
                        <span className="block text-sm text-ink-2">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {targetKind === "students" && (
                  <div className="rounded-xl border border-border bg-surface-2 p-3">
                    {roster.length === 0 ? (
                      <p className="text-sm text-ink-2">This class has no students yet.</p>
                    ) : (
                      <>
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{studentIds.size} of {roster.length} chosen</p>
                          <div className="flex gap-3 text-sm font-semibold">
                            <button type="button" className="py-1 text-link hover:underline max-sm:py-2.5" onClick={() => setStudentIds(new Set(roster.map((s) => s.id)))}>
                              Select all
                            </button>
                            <button type="button" className="py-1 text-link hover:underline max-sm:py-2.5" onClick={() => setStudentIds(new Set())}>
                              Clear
                            </button>
                          </div>
                        </div>
                        <ul className="grid gap-x-4 sm:grid-cols-2">
                          {roster.map((s) => (
                            <li key={s.id}>
                              <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink max-sm:min-h-11">
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={studentIds.has(s.id)}
                                  onChange={(e) =>
                                    setStudentIds((cur) => {
                                      const n = new Set(cur);
                                      if (e.target.checked) n.add(s.id);
                                      else n.delete(s.id);
                                      return n;
                                    })
                                  }
                                />
                                {s.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {show(errors.students) && (
                      <p role="alert" aria-invalid="true" tabIndex={-1} className="mt-2 text-sm text-risk">
                        {errors.students}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

        </fieldset>

          {/* 2 · Handout (outside the locked fieldset so failed files can still be dismissed) */}
          <Card aria-labelledby={`${uid}-files`}>
            <CardHeader
              id={`${uid}-files`}
              title="2 · Handout files"
              subtitle="The worksheet or reading students download, complete offline and send back. Up to 5 files."
            />
            <CardBody className="space-y-3">
              <DropZone onFiles={addFiles} disabled={locked || queued.length >= MAX_HANDOUTS} />
              {rejected.length > 0 && (
                <div role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
                  <p className="font-semibold">{plural(rejected.length, "file")} not added</p>
                  <ul className="mt-1 list-disc pl-5">
                    {rejected.map((r, i) => (
                      <li key={i}>
                        <span className="font-medium">{r.name}</span>: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {queued.length > 0 ? (
                <ul className="space-y-2" aria-label="Handout files">
                  {queued.map((q) => (
                    <FileRow
                      key={q.key}
                      name={q.file.name}
                      size={q.file.size}
                      status={draftId ? q.status : undefined}
                      error={q.error}
                      onRemove={locked && q.status !== "error" ? undefined : () => setQueued((xs) => xs.filter((x) => x.key !== q.key))}
                      removeLabel={q.status === "error" ? "Dismiss" : "Remove"}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">No handout yet. You can also assign homework with instructions only, or add files later while it&apos;s still a draft.</p>
              )}
              {queued.length > 0 && !draftId && (
                <p className="text-sm text-ink-2">
                  {queued.length} {queued.length === 1 ? "file" : "files"} · {formatBytes(queued.reduce((s, q) => s + q.file.size, 0))}. Files upload when you save.
                </p>
              )}
            </CardBody>
          </Card>

        <fieldset disabled={locked} className="min-w-0 space-y-6">
          {/* 3 · What students hand in */}
          <Card aria-labelledby={`${uid}-items`}>
            <CardHeader id={`${uid}-items`} title="3 · What students hand in" subtitle="Usually one uploaded file. Add written answers or auto-marked questions if you want them." />
            <CardBody className="space-y-4">
              {show(errors.items) && (
                <p role="alert" aria-invalid="true" tabIndex={-1} className="text-sm text-risk">
                  {errors.items}
                </p>
              )}
              <ol className="space-y-3">
                {items.map((it, i) => {
                  const ie = itemErrors.get(it.key)!;
                  const pid = `${uid}-${it.key}`;
                  return (
                    <li key={it.key} className="rounded-xl border border-border bg-surface-2 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                          <Badge tone={it.kind === "file" ? "brand" : "neutral"}>{it.kind === "file" ? "File upload" : "Written answer"}</Badge>
                          <span className="text-ink-2">Item {i + 1}</span>
                        </p>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label={`Move item ${i + 1} up`}>
                            ↑
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label={`Move item ${i + 1} down`}>
                            ↓
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label={`Remove item ${i + 1}`}>
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                        <div className="space-y-1.5">
                          <label htmlFor={`${pid}-prompt`} className="block text-sm font-medium text-ink">
                            {it.kind === "file" ? "What should students upload?" : "Question"}
                          </label>
                          <Textarea
                            id={`${pid}-prompt`}
                            value={it.prompt}
                            rows={it.kind === "file" ? 2 : 3}
                            className="min-h-0"
                            aria-invalid={!!show(ie.prompt)}
                            onChange={(e) => patchItem(it.key, { prompt: e.target.value })}
                          />
                          {show(ie.prompt) && (
                            <p role="alert" className="text-sm text-risk">
                              {ie.prompt}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor={`${pid}-pts`} className="block text-sm font-medium text-ink">
                            Points
                          </label>
                          <Input
                            id={`${pid}-pts`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={20}
                            value={it.points}
                            aria-invalid={!!show(ie.points)}
                            onChange={(e) => patchItem(it.key, { points: e.target.value })}
                          />
                          {show(ie.points) && (
                            <p role="alert" className="text-sm text-risk">
                              {ie.points}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setItems((xs) => [...xs, { key: nextKey(), kind: "file", prompt: "", points: "10" }])}>
                  + File upload
                </Button>
                <Button type="button" variant="secondary" onClick={() => setItems((xs) => [...xs, { key: nextKey(), kind: "text", prompt: "", points: "5" }])}>
                  + Written answer
                </Button>
                {!mcqOpen && (
                  <Button type="button" variant="secondary" onClick={() => setMcqOpen(true)}>
                    + Auto-marked questions
                  </Button>
                )}
              </div>

              {mcqOpen && (
                <section aria-labelledby={`${uid}-mcq`} className="space-y-4 rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 id={`${uid}-mcq`} className="font-semibold text-ink">
                        Auto-marked questions
                      </h3>
                      <p className="text-sm text-ink-2">Multiple-choice questions from the bank. Students get instant results and each answer feeds their practice record.</p>
                    </div>
                    {mcq.length === 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setMcqOpen(false)}>
                        Hide
                      </Button>
                    )}
                  </div>
                  <QuestionPicker topics={topics} questions={mcq} onChange={setMcq} initialModuleIds={presetModuleId ? [presetModuleId] : []} disabled={locked} />
                  {mcq.length > 0 && (
                    <div className="max-w-40 space-y-1.5">
                      <label htmlFor={`${uid}-mcqpts`} className="block text-sm font-medium text-ink">
                        Points per question
                      </label>
                      <Input id={`${uid}-mcqpts`} type="number" inputMode="numeric" min={1} max={20} value={mcqPoints} aria-invalid={!!show(mcqPointsError)} onChange={(e) => setMcqPoints(e.target.value)} />
                      {show(mcqPointsError) && (
                        <p role="alert" className="text-sm text-risk">
                          {mcqPointsError}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}
            </CardBody>
          </Card>

          {/* 4 · Rules */}
          <Card aria-labelledby={`${uid}-rules`}>
            <CardHeader id={`${uid}-rules`} title="4 · Rules" />
            <CardBody className="space-y-5">
              {mcq.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-show`} className="block text-sm font-medium text-ink">
                    Show correct answers to students
                  </label>
                  <Select id={`${uid}-show`} value={showAnswers} onChange={(e) => setShowAnswers(e.target.value as ShowAnswers)} className="sm:max-w-sm">
                    <option value="never">Never</option>
                    <option value="after_due">After the due date (once they&apos;ve handed in)</option>
                    <option value="immediately">Immediately after they hand in</option>
                  </Select>
                  <p className="text-sm text-ink-2">Applies to the auto-marked questions.</p>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3 max-sm:min-h-11">
                <input type="checkbox" className="mt-1 size-4" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
                <span>
                  <span className="block font-medium text-ink">Accept late work</span>
                  <span className="block text-sm text-ink-2">Students can still upload after the due date; late hand-ins are flagged.</span>
                </span>
              </label>
            </CardBody>
          </Card>
        </fieldset>
      </div>

      {/* Summary */}
      <aside aria-label="Summary" className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardBody className="space-y-4 pt-5">
            <div>
              <Eyebrow>What students will see</Eyebrow>
              <p className="mt-1.5 break-words text-lg font-semibold leading-snug text-ink">{title.trim() || <span className="text-ink-3">Untitled homework</span>}</p>
              <p className="text-sm text-ink-2">{cls?.name ?? "No class chosen"}</p>
            </div>
            <dl className="space-y-2.5 text-sm">
              <Row label="Due">
                {dueValid ? (
                  <>
                    {formatWhen(due)}
                    <span className="block text-ink-2" suppressHydrationWarning>
                      {relativeTime(due)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="For">{targetKind === "class" ? `Whole class (${roster.length})` : `${studentIds.size} chosen`}</Row>
              <Row label="Handout">{queued.length ? plural(queued.length, "file") : "None"}</Row>
              <Row label="Hand in">
                <ul className="space-y-0.5">
                  {items.map((it) => (
                    <li key={it.key} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{it.kind === "file" ? "File upload" : "Written answer"}</span>
                      <span className="tabular text-ink-2">{it.points || 0} pts</span>
                    </li>
                  ))}
                  {mcq.length > 0 && (
                    <li className="flex justify-between gap-2">
                      <span>{plural(mcq.length, "auto-marked question")}</span>
                      <span className="tabular text-ink-2">{mcq.length * (Number(mcqPoints) || 0)} pts</span>
                    </li>
                  )}
                  {items.length + mcq.length === 0 && <li className="text-ink-2">Nothing yet</li>}
                </ul>
              </Row>
              <Row label="Total">
                <strong className="tabular">{totalPoints} points</strong>
              </Row>
              <Row label="Late work">{allowLate ? "Accepted, flagged" : "Not accepted"}</Row>
              {mcq.length > 0 && <Row label="Answers">{{ never: "Never shown", after_due: "After the due date", immediately: "Right after hand-in" }[showAnswers]}</Row>}
            </dl>

            {showErrors && problemsFor(wantAssign).length > 0 && (
              <div role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
                <p className="font-semibold">{plural(problemsFor(wantAssign).length, "thing")} to fix</p>
                <ul className="mt-1 list-disc pl-5">
                  {[...new Set(problemsFor(wantAssign))].slice(0, 5).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {formError && (
              <div role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
                <p>{formError}</p>
                {draftId && (
                  <Link href={`/teacher/homework/${draftId}`} className="mt-1 inline-block font-semibold underline underline-offset-2">
                    Open the draft
                  </Link>
                )}
              </div>
            )}
            {draftId && queued.some((q) => q.status === "error") && busy === null && (
              <Button type="button" className="w-full" variant="secondary" onClick={() => void submit(wantAssign)}>
                Retry failed uploads{wantAssign ? " and assign" : ""}
              </Button>
            )}
            {draftId && !queued.some((q) => q.status === "error") && formError && busy === null && (
              <Button type="button" className="w-full" variant="secondary" onClick={() => void (wantAssign ? submit(true) : router.push(`/teacher/homework/${draftId}`))}>
                {wantAssign ? "Assign now" : "Open the draft"}
              </Button>
            )}

            {!draftId && (
              <div className="flex flex-col gap-2">
                <Button type="button" className="w-full" disabled={busy !== null} onClick={() => void submit(true)}>
                  {busy ? (
                    <>
                      <Spinner className="border-brand-ink border-t-transparent" /> {busyLabel}
                    </>
                  ) : (
                    "Assign now"
                  )}
                </Button>
                <Button type="button" variant="secondary" className="w-full" disabled={busy !== null} onClick={() => void submit(false)}>
                  Save draft
                </Button>
                <p className="text-xs text-ink-3">A draft stays private. You can add or remove files and assign it later.</p>
              </div>
            )}
            {busy === "uploading" && (
              <p className="text-sm text-ink-2">
                {uploadedDone} of {queued.length} files uploaded
              </p>
            )}
          </CardBody>
        </Card>
        <p aria-live="polite" role="status" className="sr-only">
          {status}
        </p>
      </aside>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
