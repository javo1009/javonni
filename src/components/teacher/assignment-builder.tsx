"use client";

// Stepped homework builder (UX-DESIGN.md §5.7): Basics → Content → Targets & schedule → Review.
// All state is local; the final submit posts JSON through a server action that re-validates everything.
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { assembleAction, createAssignmentAction } from "@/app/actions/teacher";
import { Badge, Button, Card, CardBody, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BuilderTopic, QuestionPreview } from "@/services/teacher-views";

type ClassOpt = { id: string; name: string; students: { id: string; name: string }[] };
type Item = { key: string; kind: "mcq"; q: QuestionPreview } | { key: string; kind: "text"; prompt: string; points: number };
type ShowAnswers = "never" | "after_due" | "immediately";

const STEPS = ["Basics", "Content", "Targets & schedule", "Review"] as const;
const DIFFICULTY = { 1: "Easy", 2: "Medium", 3: "Hard" } as Record<number, string>;
const SHOW_ANSWERS: Record<ShowAnswers, string> = {
  after_due: "After the due date",
  immediately: "Right after they submit",
  never: "Never (score only)",
};

let keySeq = 0;
const nextKey = () => `i${++keySeq}`;

export function AssignmentBuilder({
  classes,
  topics,
  initialClassId,
  initialLosIds,
  initialTitle,
  defaultDue,
}: {
  classes: ClassOpt[];
  topics: BuilderTopic[];
  initialClassId: string;
  initialLosIds: string[];
  initialTitle: string;
  defaultDue: string;
}) {
  const router = useRouter();
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const [step, setStep] = useState(0);
  const [classId, setClassId] = useState(initialClassId);
  const [title, setTitle] = useState(initialTitle);
  const [instructions, setInstructions] = useState("");
  const [selected, setSelected] = useState<string[]>(initialLosIds);
  const [openTopics, setOpenTopics] = useState<string[]>(() =>
    topics.filter((t) => t.modules.some((m) => m.los.some((l) => initialLosIds.includes(l.id)))).map((t) => t.id),
  );
  const [count, setCount] = useState(10);
  const [items, setItems] = useState<Item[]>([]);
  const [assembledFor, setAssembledFor] = useState<string[] | null>(null);
  const [targetKind, setTargetKind] = useState<"class" | "students">("class");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [due, setDue] = useState(defaultDue);
  const [showAnswers, setShowAnswers] = useState<ShowAnswers>("after_due");
  const [allowLate, setAllowLate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assembling, startAssemble] = useTransition();
  const [saving, startSave] = useTransition();

  const cls = classes.find((c) => c.id === classId)!;
  const losIndex = useMemo(() => {
    const m = new Map<string, { code: string; text: string; questions: number; topic: string; module: string }>();
    for (const t of topics) for (const mod of t.modules) for (const l of mod.los) m.set(l.id, { ...l, topic: t.code, module: mod.title });
    return m;
  }, [topics]);

  // Move focus to the step heading after navigating between steps (not on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const mcqs = items.filter((i): i is Extract<Item, { kind: "mcq" }> => i.kind === "mcq");
  const texts = items.filter((i): i is Extract<Item, { kind: "text" }> => i.kind === "text");
  const coveredLos = selected.filter((id) => mcqs.some((i) => i.q.losId === id));
  const uncoveredLos = selected.filter((id) => !coveredLos.includes(id));
  const totalPoints = items.reduce((s, i) => s + (i.kind === "mcq" ? 1 : i.points), 0);

  function stepError(s: number): string | null {
    if (s === 0) {
      if (!cls) return "Choose a class.";
      const t = title.trim();
      if (t.length < 3 || t.length > 120) return "Give the homework a title of 3–120 characters.";
    }
    if (s === 1) {
      if (items.length === 0) return "Add at least one item: assemble questions or add a written prompt.";
      if (items.length > 60) return "Keep homework to 60 items or fewer.";
      for (const t of texts) {
        if (t.prompt.trim().length < 5) return "Each written prompt needs at least 5 characters.";
        if (!Number.isInteger(t.points) || t.points < 1 || t.points > 20) return "Written prompts are worth 1–20 points.";
      }
    }
    if (s === 2) {
      if (targetKind === "students" && studentIds.length === 0) return "Choose at least one student, or assign to the whole class.";
      if (!due || Number.isNaN(new Date(due).getTime())) return "Enter a due date and time.";
    }
    return null;
  }

  function goTo(s: number) {
    for (let k = 0; k < s; k++) {
      const e = stepError(k);
      if (e) {
        setError(e);
        setStep(k);
        return;
      }
    }
    setError(null);
    setNotice(null);
    setStep(s);
  }

  function assemble(mode: "replace" | "append") {
    setError(null);
    setNotice(null);
    if (selected.length === 0) {
      setError("Pick at least one learning objective first.");
      return;
    }
    startAssemble(async () => {
      const res = await assembleAction({
        losIds: selected,
        count,
        excludeIds: mode === "append" ? mcqs.map((m) => m.q.id) : [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const fresh: Item[] = res.data.questions.map((q) => ({ key: nextKey(), kind: "mcq", q }));
      if (mode === "append") {
        setItems((cur) => [...cur.filter((i) => i.kind === "mcq"), ...fresh, ...cur.filter((i) => i.kind === "text")]);
        setNotice(fresh.length ? `Added ${fresh.length} more question${fresh.length === 1 ? "" : "s"}.` : "No more unused questions for these objectives.");
      } else {
        setItems((cur) => [...fresh, ...cur.filter((i) => i.kind === "text")]);
        setNotice(
          fresh.length < count
            ? `Only ${fresh.length} published question${fresh.length === 1 ? "" : "s"} match these objectives.`
            : `Assembled ${fresh.length} questions.`,
        );
      }
      setAssembledFor([...selected]);
    });
  }

  function move(key: string, dir: -1 | 1) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function submit(assign: boolean) {
    for (let k = 0; k < 3; k++) {
      const e = stepError(k);
      if (e) {
        setError(e);
        setStep(k);
        return;
      }
    }
    // The server rejects a past due date when assigning; drafts may keep one.
    const dueAt = new Date(due);
    setError(null);
    startSave(async () => {
      const res = await createAssignmentAction({
        classId,
        title: title.trim(),
        instructions,
        dueAt: dueAt.toISOString(),
        target: targetKind === "class" ? { kind: "class" } : { kind: "students", studentIds },
        policies: { showAnswers, allowLate },
        items: items.map((i) => (i.kind === "mcq" ? { kind: "mcq", questionId: i.q.id } : { kind: "text", prompt: i.prompt.trim(), points: i.points })),
        assign,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/teacher/homework/${res.data.id}?${assign ? "assigned" : "saved"}=1`);
    });
  }

  const toggleLos = (id: string, on: boolean) => setSelected((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
  const setMany = (ids: string[], on: boolean) => setSelected((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x))));
  const stale = assembledFor !== null && (assembledFor.length !== selected.length || assembledFor.some((x) => !selected.includes(x)));

  return (
    <div className="space-y-6">
      <nav aria-label="Homework builder steps">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                  i === step ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border bg-surface text-ink-2 hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn("grid size-5 place-items-center rounded-full text-xs", i === step ? "bg-brand text-brand-ink" : i < step ? "bg-ink-3 text-surface" : "bg-surface-2")}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {label}
                <span className="sr-only">{i < step ? " (done)" : ""}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Card>
        <CardBody className="space-y-5 pt-5">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-ink outline-none">
            Step {step + 1} of 4: {STEPS[step]}
          </h2>

          {step === 0 && (
            <div className="grid max-w-2xl gap-4">
              <Field label="Class" htmlFor={`${uid}-class`}>
                <Select
                  id={`${uid}-class`}
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setStudentIds([]);
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.students.length} students)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Title" htmlFor={`${uid}-title`} hint="Students see this in their homework inbox.">
                <Input id={`${uid}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Inventories & long-lived assets" />
              </Field>
              <Field label="Instructions (optional)" htmlFor={`${uid}-instr`}>
                <Textarea
                  id={`${uid}-instr`}
                  value={instructions}
                  maxLength={4000}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Work without notes first, then review the explanations."
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section aria-labelledby={`${uid}-los-h`} className="min-w-0">
                <h3 id={`${uid}-los-h`} className="text-sm font-semibold text-ink">
                  1. Pick learning objectives
                </h3>
                <p className="mt-1 text-sm text-ink-2">Open a topic, then tick modules or single objectives. The number shows published questions.</p>
                {selected.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Selected objectives">
                    {selected.map((id) => {
                      const l = losIndex.get(id);
                      return (
                        <li key={id}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand">
                            {l?.code ?? "?"}
                            <button type="button" onClick={() => toggleLos(id, false)} className="grid size-5 place-items-center rounded-full hover:bg-brand/15" aria-label={`Remove ${l?.code}`}>
                              <X aria-hidden className="size-3" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                    <li>
                      <button type="button" onClick={() => setSelected([])} className="px-1 text-xs text-ink-2 underline hover:text-ink">
                        Clear all
                      </button>
                    </li>
                  </ul>
                )}
                <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {topics.map((t) => {
                    const ids = t.modules.flatMap((m) => m.los.map((l) => l.id));
                    const n = ids.filter((id) => selected.includes(id)).length;
                    return (
                      <details
                        key={t.id}
                        open={openTopics.includes(t.id)}
                        onToggle={(e) => {
                          const isOpen = e.currentTarget.open;
                          setOpenTopics((cur) => (isOpen ? (cur.includes(t.id) ? cur : [...cur, t.id]) : cur.filter((x) => x !== t.id)));
                        }}
                        className="group rounded-md"
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                          <span className="font-medium text-ink">
                            <span className="mr-1.5 text-xs text-ink-2">{t.code}</span>
                            {t.name}
                          </span>
                          {n > 0 && <Badge tone="brand">{n} selected</Badge>}
                        </summary>
                        <div className="space-y-2 py-1 pl-3">
                          {t.modules.map((m) => {
                            const mids = m.los.map((l) => l.id);
                            const k = mids.filter((id) => selected.includes(id)).length;
                            return (
                              <fieldset key={m.id} className="rounded-md border border-border px-2 py-1.5">
                                <legend className="px-1">
                                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                                    <input
                                      type="checkbox"
                                      className="size-4 accent-[var(--brand)]"
                                      checked={k === mids.length && mids.length > 0}
                                      ref={(el) => {
                                        if (el) el.indeterminate = k > 0 && k < mids.length;
                                      }}
                                      onChange={(e) => setMany(mids, e.target.checked)}
                                    />
                                    {m.title}
                                  </label>
                                </legend>
                                <ul className="space-y-0.5">
                                  {m.los.map((l) => (
                                    <li key={l.id}>
                                      <label className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
                                        <input
                                          type="checkbox"
                                          className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                                          checked={selected.includes(l.id)}
                                          onChange={(e) => toggleLos(l.id, e.target.checked)}
                                        />
                                        <span className="min-w-0 flex-1">
                                          <span className="font-medium text-ink">{l.code}</span> <span className="text-ink-2">{l.text}</span>
                                        </span>
                                        <span className={cn("tabular shrink-0 text-xs", l.questions ? "text-ink-2" : "font-medium text-warn")}>
                                          {l.questions ? `${l.questions} Q` : "No Qs"}
                                        </span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </fieldset>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby={`${uid}-items-h`} className="min-w-0">
                <h3 id={`${uid}-items-h`} className="text-sm font-semibold text-ink">
                  2. Assemble questions
                </h3>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="w-24 space-y-1">
                    <label htmlFor={`${uid}-count`} className="block text-sm font-medium text-ink">
                      Count
                    </label>
                    <Input
                      id={`${uid}-count`}
                      type="number"
                      min={1}
                      max={40}
                      value={count}
                      onChange={(e) => setCount(Math.max(1, Math.min(40, Math.floor(Number(e.target.value) || 1))))}
                    />
                  </div>
                  <Button type="button" onClick={() => assemble("replace")} disabled={assembling || selected.length === 0} aria-busy={assembling}>
                    {assembling ? "Assembling…" : mcqs.length ? "Re-assemble" : "Assemble"}
                  </Button>
                  {mcqs.length > 0 && (
                    <Button type="button" variant="secondary" onClick={() => assemble("append")} disabled={assembling}>
                      <Plus aria-hidden className="size-4" /> Add {count} more
                    </Button>
                  )}
                </div>
                <div role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-ink-2">
                  {notice}
                  {stale && mcqs.length > 0 && " Objectives changed since you assembled; re-assemble to match."}
                </div>
                {selected.length > 0 && (
                  <p className={cn("mt-1 rounded-lg px-3 py-2 text-sm", uncoveredLos.length ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
                    <span className="font-semibold">
                      Coverage: {coveredLos.length} of {selected.length} selected objectives covered.
                    </span>
                    {uncoveredLos.length > 0 && (
                      <span className="block">
                        Not covered: {uncoveredLos.map((id) => losIndex.get(id)?.code).join(", ")}
                        {uncoveredLos.some((id) => (losIndex.get(id)?.questions ?? 0) === 0) && " (some have no questions in the bank)"}
                      </span>
                    )}
                  </p>
                )}

                <ol className="mt-3 space-y-2" aria-label={`Homework items (${items.length})`}>
                  {items.map((it, idx) => (
                    <li key={it.key} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-start gap-3">
                        <span className="tabular mt-0.5 w-6 shrink-0 text-sm font-semibold text-ink-2">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          {it.kind === "mcq" ? (
                            <>
                              <p className="line-clamp-2 text-sm text-ink">{it.q.stem}</p>
                              <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-2">
                                {it.q.losCode && <Badge>{it.q.losCode}</Badge>}
                                <Badge>{DIFFICULTY[it.q.difficulty] ?? "Medium"}</Badge>
                                <span>1 pt · multiple choice</span>
                              </p>
                            </>
                          ) : (
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <label htmlFor={`${uid}-${it.key}-p`} className="block text-sm font-medium text-ink">
                                  Written prompt
                                </label>
                                <Textarea
                                  id={`${uid}-${it.key}-p`}
                                  value={it.prompt}
                                  maxLength={2000}
                                  rows={3}
                                  onChange={(e) => setItems((cur) => cur.map((x) => (x.key === it.key && x.kind === "text" ? { ...x, prompt: e.target.value } : x)))}
                                  placeholder="Explain in two or three sentences why…"
                                  className="text-sm"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label htmlFor={`${uid}-${it.key}-pts`} className="text-sm font-medium text-ink">
                                  Points
                                </label>
                                <Input
                                  id={`${uid}-${it.key}-pts`}
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={it.points}
                                  onChange={(e) =>
                                    setItems((cur) =>
                                      cur.map((x) => (x.key === it.key && x.kind === "text" ? { ...x, points: Math.floor(Number(e.target.value) || 0) } : x)),
                                    )
                                  }
                                  className="w-20!"
                                />
                                <span className="text-xs text-ink-2">Graded by you</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                          <button type="button" onClick={() => move(it.key, -1)} disabled={idx === 0} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30" aria-label={`Move item ${idx + 1} up`}>
                            <ArrowUp aria-hidden className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(it.key, 1)}
                            disabled={idx === items.length - 1}
                            className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30"
                            aria-label={`Move item ${idx + 1} down`}
                          >
                            <ArrowDown aria-hidden className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setItems((cur) => cur.filter((x) => x.key !== it.key))}
                            className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-risk-soft hover:text-risk"
                            aria-label={`Remove item ${idx + 1}`}
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setItems((cur) => [...cur, { key: nextKey(), kind: "text", prompt: "", points: 2 }])}>
                    <Plus aria-hidden className="size-4" /> Add a written prompt
                  </Button>
                  <span className="tabular text-sm text-ink-2">
                    {items.length} item{items.length === 1 ? "" : "s"} · {totalPoints} pts
                  </span>
                </div>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="grid max-w-2xl gap-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink">Who gets it</legend>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="radio" name={`${uid}-target`} className="size-4 accent-[var(--brand)]" checked={targetKind === "class"} onChange={() => setTargetKind("class")} />
                  Whole class ({cls.students.length} students, plus anyone who joins later)
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="radio" name={`${uid}-target`} className="size-4 accent-[var(--brand)]" checked={targetKind === "students"} onChange={() => setTargetKind("students")} />
                  Chosen students
                </label>
                {targetKind === "students" && (
                  <div className="ml-6 rounded-lg border border-border p-3">
                    {cls.students.length === 0 ? (
                      <p className="text-sm text-ink-2">This class has no students yet.</p>
                    ) : (
                      <>
                        <div className="mb-2 flex gap-3 text-xs">
                          <button type="button" className="text-brand underline" onClick={() => setStudentIds(cls.students.map((s) => s.id))}>
                            Select all
                          </button>
                          <button type="button" className="text-ink-2 underline" onClick={() => setStudentIds([])}>
                            Clear
                          </button>
                          <span className="text-ink-2">{studentIds.length} chosen</span>
                        </div>
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {cls.students.map((s) => (
                            <li key={s.id}>
                              <label className="flex items-center gap-2 text-sm text-ink">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[var(--brand)]"
                                  checked={studentIds.includes(s.id)}
                                  onChange={(e) => setStudentIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                                />
                                {s.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </fieldset>
              <Field label="Due" htmlFor={`${uid}-due`} hint="Your local time.">
                <Input id={`${uid}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-64! max-w-full" />
              </Field>
              <Field label="Show answers and explanations" htmlFor={`${uid}-show`}>
                <Select id={`${uid}-show`} value={showAnswers} onChange={(e) => setShowAnswers(e.target.value as ShowAnswers)} className="w-64! max-w-full">
                  {(Object.keys(SHOW_ANSWERS) as ShowAnswers[]).map((k) => (
                    <option key={k} value={k}>
                      {SHOW_ANSWERS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
                Accept late submissions (marked as late)
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-ink-2">Class</dt>
                <dd className="text-ink">{cls.name}</dd>
                <dt className="text-ink-2">Title</dt>
                <dd className="font-medium text-ink">{title.trim()}</dd>
                {instructions.trim() && (
                  <>
                    <dt className="text-ink-2">Instructions</dt>
                    <dd className="whitespace-pre-line text-ink">{instructions.trim()}</dd>
                  </>
                )}
                <dt className="text-ink-2">Items</dt>
                <dd className="text-ink">
                  {mcqs.length} multiple choice, {texts.length} written · {totalPoints} points
                </dd>
                <dt className="text-ink-2">Coverage</dt>
                <dd className="text-ink">
                  {selected.length ? `${coveredLos.length} of ${selected.length} selected objectives` : "No objectives selected (written items only)"}
                </dd>
                <dt className="text-ink-2">Assigned to</dt>
                <dd className="text-ink">
                  {targetKind === "class"
                    ? `Whole class (${cls.students.length})`
                    : cls.students
                        .filter((s) => studentIds.includes(s.id))
                        .map((s) => s.name)
                        .join(", ")}
                </dd>
                <dt className="text-ink-2">Due</dt>
                <dd className="text-ink">
                  {due && !Number.isNaN(new Date(due).getTime())
                    ? new Date(due).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </dd>
                <dt className="text-ink-2">Answers shown</dt>
                <dd className="text-ink">{SHOW_ANSWERS[showAnswers]}</dd>
                <dt className="text-ink-2">Late work</dt>
                <dd className="text-ink">{allowLate ? "Accepted, marked late" : "Not accepted after the due time"}</dd>
              </dl>
              <p className="text-sm text-ink-2">Drafts are only visible to you. Assigning makes it appear in students’ homework inboxes straight away.</p>
            </div>
          )}

          <FormError message={error ?? undefined} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0 || saving}>
              Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => {
                  const e = stepError(step);
                  if (e) setError(e);
                  else goTo(step + 1);
                }}
              >
                Next: {STEPS[step + 1]}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => submit(false)} disabled={saving}>
                  Save as draft
                </Button>
                <Button type="button" onClick={() => submit(true)} disabled={saving} aria-busy={saving}>
                  {saving ? "Saving…" : "Assign now"}
                </Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
