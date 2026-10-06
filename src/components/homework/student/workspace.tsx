"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { saveHomeworkDraft, submitHomework } from "@/app/actions/student";
import { Banner, Button, Card, FormError, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describeDue, formatDue, type ItemKind } from "./due";
import { FileUploadItem, type UploadedFile } from "./file-upload-item";
import { computeMissing, type WorkAnswers } from "./missing";

export type WorkspaceItem = {
  id: string;
  kind: ItemKind;
  points: number;
  prompt: string;
  options: { key: string; text: string }[] | null;
  answer: { chosenKey: string | null; textAnswer: string | null };
  files: UploadedFile[];
};

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
const AUTOSAVE_MS = 700;

const KIND_LABEL: Record<ItemKind, string> = { mcq: "Multiple choice", text: "Written answer", file: "File upload" };

export function HomeworkWorkspace({
  assignmentId,
  title,
  dueAt,
  serverNow,
  allowLate,
  timeZone,
  items,
}: {
  assignmentId: string;
  title: string;
  /** ISO strings: this component is hydrated, so it keeps its own clock for the deadline. */
  dueAt: string;
  serverNow: string;
  allowLate: boolean;
  timeZone: string;
  items: WorkspaceItem[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<WorkAnswers>(() => Object.fromEntries(items.map((i) => [i.id, i.answer])));
  const [files, setFiles] = useState<Record<string, UploadedFile[]>>(() => Object.fromEntries(items.filter((i) => i.kind === "file").map((i) => [i.id, i.files])));
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Keep a clock so the late/closed state appears if the deadline passes while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const due = describeDue(dueAt, now);
  const closed = due.overdue && !allowLate;
  const late = due.overdue && allowLate;

  // ---------------------------------------------------------------- autosave
  const answersRef = useRef(answers);
  const touched = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const locked = useRef(false);
  const kindById = useMemo(() => new Map(items.map((i) => [i.id, i.kind])), [items]);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    const ids = [...touched.current];
    if (ids.length === 0 || locked.current) return;
    touched.current.clear();
    setSaveState("saving");
    const payload = ids.map((id) => {
      const a = answersRef.current[id];
      return kindById.get(id) === "mcq" ? { itemId: id, chosenKey: a?.chosenKey ?? null } : { itemId: id, textAnswer: a?.textAnswer ?? null };
    });
    let ok = true;
    const run = (async () => {
      try {
        const res = await saveHomeworkDraft(assignmentId, payload);
        if (res.ok) {
          setSaveError(null);
          setSaveState(touched.current.size ? "pending" : "saved");
        } else {
          ok = false;
          ids.forEach((id) => touched.current.add(id));
          setSaveError(res.error);
          setSaveState("error");
          if (/already been submitted/i.test(res.error)) router.refresh();
        }
      } catch {
        ok = false;
        ids.forEach((id) => touched.current.add(id));
        setSaveError("Couldn't reach the server. Your answers will be saved when you keep going.");
        setSaveState("error");
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
    // Something changed while that save was in flight: save again shortly.
    if (ok && touched.current.size && !locked.current && !timer.current) timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
  }, [assignmentId, kindById, router]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const change = useCallback(
    (id: string, next: { chosenKey?: string | null; textAnswer?: string | null }, delay = AUTOSAVE_MS) => {
      if (locked.current) return;
      const merged = { ...answersRef.current[id], ...next };
      answersRef.current = { ...answersRef.current, [id]: merged };
      setAnswers(answersRef.current);
      touched.current.add(id);
      setSubmitError(null);
      setSaveState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), delay);
    },
    [],
  );

  // Save what's pending when the student leaves the page or the tab.
  useEffect(() => {
    const pending = touched.current;
    const onHide = () => {
      if (document.visibilityState === "hidden" && pending.size) void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (pending.size && !locked.current) void flush();
    };
  }, [flush]);

  // ---------------------------------------------------------------- files
  const fileCounts = useMemo(() => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), [files]);
  const onBusyChange = useCallback((itemId: string, busy: boolean) => {
    setUploading((s) => {
      const n = new Set(s);
      if (busy) n.add(itemId);
      else n.delete(itemId);
      return n.size === s.size && n.has(itemId) === s.has(itemId) ? s : n;
    });
  }, []);
  const onAdded = useCallback((itemId: string, f: UploadedFile) => {
    setSubmitError(null);
    setFiles((all) => ({ ...all, [itemId]: [...(all[itemId] ?? []), f] }));
  }, []);
  const onRemoved = useCallback((itemId: string, fileId: string) => setFiles((all) => ({ ...all, [itemId]: (all[itemId] ?? []).filter((f) => f.id !== fileId) })), []);

  // ---------------------------------------------------------------- hand in
  const missing = computeMissing(items, answers, fileCounts);
  const busyUploading = uploading.size > 0;
  const readyToSubmit = missing.ready && !busyUploading && !closed;
  const canHandIn = readyToSubmit && !submitting;

  async function handIn() {
    setSubmitting(true);
    setSubmitError(null);
    // Stop autosave and let any save in flight land first, so nothing races the hand-in.
    locked.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    const payload = items
      .filter((i) => i.kind !== "file")
      .map((i) => {
        const a = answersRef.current[i.id];
        return i.kind === "mcq" ? { itemId: i.id, chosenKey: a?.chosenKey ?? null } : { itemId: i.id, textAnswer: a?.textAnswer ?? null };
      });
    try {
      const res = await submitHomework(assignmentId, payload);
      if (res.ok) {
        dialogRef.current?.close();
        router.refresh();
        return;
      }
      locked.current = false;
      dialogRef.current?.close();
      setSubmitError(res.error);
    } catch {
      locked.current = false;
      dialogRef.current?.close();
      setSubmitError("Couldn't reach the server, so nothing was handed in. Try again.");
    }
    setSubmitting(false);
  }

  const disabledReason = closed ? "The deadline has passed and your teacher isn't accepting late work." : undefined;
  let number = 0;

  return (
    <div className="space-y-5">
      {closed && (
        <Banner tone="risk" title="This homework is closed">
          The deadline was {formatDue(dueAt, timeZone)} and late work isn&apos;t accepted, so uploads and hand-in are turned off. Talk to your teacher if you need more time.
        </Banner>
      )}
      {late && (
        <Banner tone="warn" title="You're past the deadline">
          Late work is accepted for this homework, but it will be marked as handed in late.
        </Banner>
      )}

      <ol className="space-y-4">
        {items.map((item) => {
          number++;
          const headingId = `item-${item.id}`;
          return (
            <li key={item.id}>
              <Card aria-labelledby={headingId}>
                <div className="px-5 pb-5 pt-4 max-sm:px-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                    <span className="font-semibold text-eyebrow">{item.kind === "file" ? "Upload" : `Question ${number}`}</span>
                    <span>{KIND_LABEL[item.kind]}</span>
                    <span>
                      {item.points} {item.points === 1 ? "point" : "points"}
                    </span>
                  </div>
                  {item.kind === "mcq" && item.options ? (
                    <fieldset disabled={closed} className="mt-2 min-w-0 border-0 p-0">
                      <legend id={headingId} className="whitespace-pre-wrap text-lg font-medium leading-snug text-ink">
                        {item.prompt}
                      </legend>
                      <div className="mt-4 grid gap-2.5">
                        {item.options.map((o) => {
                          const checked = answers[item.id]?.chosenKey === o.key;
                          return (
                            <label
                              key={o.key}
                              className={cn(
                                "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                                checked ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-2 hover:bg-surface-3",
                                closed && "cursor-not-allowed opacity-70",
                              )}
                            >
                              <input
                                type="radio"
                                name={`q-${item.id}`}
                                value={o.key}
                                checked={checked}
                                onChange={() => change(item.id, { chosenKey: o.key }, 250)}
                                className="peer sr-only"
                              />
                              <span
                                aria-hidden
                                className={cn(
                                  "mt-px grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold",
                                  checked ? "border-brand bg-brand text-brand-ink" : "border-border-strong text-ink-2",
                                )}
                              >
                                {checked ? <Check className="size-4" strokeWidth={3} /> : o.key}
                              </span>
                              <span className="min-w-0 whitespace-pre-wrap pt-0.5 text-ink">
                                <span className="sr-only">Option {o.key}: </span>
                                {o.text}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {answers[item.id]?.chosenKey && !closed && (
                        <button
                          type="button"
                          onClick={() => change(item.id, { chosenKey: null }, 250)}
                          className="mt-2 inline-flex h-9 items-center rounded-md px-2 text-sm text-link underline-offset-2 hover:underline max-sm:h-11"
                        >
                          Clear my answer
                        </button>
                      )}
                    </fieldset>
                  ) : item.kind === "text" ? (
                    <div className="mt-2">
                      <label htmlFor={`t-${item.id}`} id={headingId} className="block whitespace-pre-wrap text-lg font-medium leading-snug text-ink">
                        {item.prompt}
                      </label>
                      <Textarea
                        id={`t-${item.id}`}
                        className="mt-3 min-h-36"
                        rows={6}
                        maxLength={10_000}
                        disabled={closed}
                        placeholder="Type your answer here. It saves as you go."
                        value={answers[item.id]?.textAnswer ?? ""}
                        onChange={(e) => change(item.id, { textAnswer: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="mt-2">
                      <h3 id={headingId} className="whitespace-pre-wrap text-lg font-medium leading-snug text-ink">
                        {item.prompt}
                      </h3>
                      <div className="mt-4">
                        <FileUploadItem
                          assignmentId={assignmentId}
                          itemId={item.id}
                          label={item.prompt}
                          files={files[item.id] ?? []}
                          disabled={closed}
                          disabledReason={disabledReason}
                          onAdded={(f) => onAdded(item.id, f)}
                          onRemoved={(fid) => onRemoved(item.id, fid)}
                          onBusyChange={onBusyChange}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {/* Sticky hand-in bar */}
      <section
        aria-label="Hand in"
        className="sticky bottom-3 z-20 rounded-2xl border border-border-strong bg-surface/95 p-3 shadow-[var(--shadow)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 max-sm:bottom-2 sm:p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1 text-sm">
            {closed ? (
              <p className="flex items-center gap-2 font-medium text-risk">
                <TriangleAlert aria-hidden className="size-4 shrink-0" /> Closed: late work isn&apos;t accepted.
              </p>
            ) : busyUploading ? (
              <p className="flex items-center gap-2 font-medium text-ink">
                <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> Uploading files…
              </p>
            ) : (
              <>
                {missing.blocking.map((m) => (
                  <p key={m} className="flex items-center gap-2 font-medium text-warn">
                    <CircleAlert aria-hidden className="size-4 shrink-0" /> {m}
                  </p>
                ))}
                {missing.warnings.map((m) => (
                  <p key={m} className="flex items-center gap-2 text-ink-2">
                    <CircleAlert aria-hidden className="size-4 shrink-0" /> {m}
                  </p>
                ))}
                {missing.ready && missing.warnings.length === 0 && (
                  <p className="flex items-center gap-2 font-medium text-good">
                    <Check aria-hidden className="size-4 shrink-0" /> Everything is done. Ready to hand in.
                  </p>
                )}
              </>
            )}
            <p role="status" aria-live="polite" className="min-h-4 text-xs text-ink-3" data-testid="save-indicator">
              {saveState === "saving" || saveState === "pending" ? (
                "Saving…"
              ) : saveState === "saved" ? (
                <span className="inline-flex items-center gap-1">
                  <Check aria-hidden className="size-3" /> Saved
                </span>
              ) : (
                ""
              )}
            </p>
          </div>
          <Button size="lg" disabled={!canHandIn} onClick={() => dialogRef.current?.showModal()} className="max-sm:w-full">
            <Send aria-hidden className="size-4" />
            Hand in
          </Button>
        </div>
        {saveError && saveState === "error" && <FormError message={saveError} />}
        {submitError && (
          <div className="mt-2">
            <FormError message={submitError} />
          </div>
        )}
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby="handin-title"
        aria-describedby="handin-desc"
        onCancel={(e) => {
          if (submitting) e.preventDefault();
        }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border-strong bg-surface p-0 text-ink shadow-[var(--shadow)] backdrop:bg-black/60"
      >
        <div className="space-y-4 p-6 max-sm:p-5">
          <h2 id="handin-title" className="text-xl font-semibold tracking-tight">
            Hand in &ldquo;{title}&rdquo;?
          </h2>
          <div id="handin-desc" className="space-y-2 text-sm text-ink-2">
            <p>Once you hand in, you can&apos;t change your answers or files. This can&apos;t be undone.</p>
            {missing.warnings.length > 0 && <p className="font-medium text-warn">{missing.warnings.join(". ")}. Unanswered questions score no points.</p>}
            {late && <p className="font-medium text-warn">It will be marked as handed in late.</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={submitting} onClick={() => dialogRef.current?.close()}>
              Keep working
            </Button>
            <Button disabled={!canHandIn} onClick={handIn} aria-busy={submitting}>
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Handing in…
                </>
              ) : (
                "Yes, hand in"
              )}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
