"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveHomeworkDraft, submitHomework } from "@/app/actions/student";
import { Banner, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export type HomeworkFormItem = {
  id: string;
  kind: "mcq" | "text";
  points: number;
  prompt: string | null;
  options: { key: string; text: string }[] | null;
  answer: { chosenKey: string | null; textAnswer: string | null };
};

type Answers = Record<string, { chosenKey: string | null; textAnswer: string | null }>;
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

const AUTOSAVE_MS = 1500;

export function HomeworkForm({ assignmentId, items, canSubmit, blockedReason }: { assignmentId: string; items: HomeworkFormItem[]; canSubmit: boolean; blockedReason?: string }) {
  const [answers, setAnswers] = useState<Answers>(() => Object.fromEntries(items.map((i) => [i.id, { ...i.answer }])));
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);
  const confirmRef = useRef<HTMLDivElement>(null);

  const payload = (a: Answers) => ({
    assignmentId,
    answers: Object.entries(a).map(([itemId, v]) => ({ itemId, chosenKey: v.chosenKey, textAnswer: v.textAnswer })),
  });

  const doSave = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSave({ kind: "saving" });
    const r = await saveHomeworkDraft(payload(latest.current));
    if (r.ok) {
      setSave({ kind: "saved", at: r.data.savedAt });
      setDirty(false);
    } else setSave({ kind: "error", message: r.error });
  };

  const change = (itemId: string, patch: Partial<Answers[string]>) => {
    const prev = latest.current;
    const next = { ...prev, [itemId]: { ...prev[itemId], ...patch } };
    latest.current = next;
    setAnswers(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), AUTOSAVE_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const unanswered = items.filter((i) => {
    const a = answers[i.id];
    return i.kind === "mcq" ? !a?.chosenKey : !a?.textAnswer?.trim();
  }).length;

  const submit = () =>
    startSubmit(async () => {
      if (timer.current) clearTimeout(timer.current);
      setSubmitError(null);
      const r = await submitHomework(payload(latest.current));
      if (!r.ok) {
        setSubmitError(r.error);
        setConfirming(false);
      } else setDirty(false);
    });

  const saveLabel =
    save.kind === "saving"
      ? "Saving…"
      : save.kind === "saved"
        ? `Draft saved ${new Date(save.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : save.kind === "error"
          ? `Couldn't save: ${save.message}`
          : dirty
            ? "Unsaved changes"
            : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      className="space-y-4"
      noValidate
    >
      <ol className="space-y-4">
        {items.map((it, n) => (
          <li key={it.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
            {it.kind === "mcq" ? (
              <fieldset>
                <legend className="mb-3 text-ink">
                  <span className="mr-2 text-sm font-semibold text-ink-2">Q{n + 1}.</span>
                  {it.prompt}
                  <span className="ml-2 text-xs text-ink-2">
                    ({it.points} pt{it.points === 1 ? "" : "s"})
                  </span>
                </legend>
                <div className="space-y-2">
                  {it.options?.map((o) => {
                    const checked = answers[it.id]?.chosenKey === o.key;
                    return (
                      <label
                        key={o.key}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                          checked ? "border-brand bg-brand-soft" : "border-border-strong hover:bg-surface-2",
                        )}
                      >
                        <input
                          type="radio"
                          name={`item-${it.id}`}
                          value={o.key}
                          checked={checked}
                          onChange={() => change(it.id, { chosenKey: o.key })}
                          className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                        />
                        <span className="text-ink">
                          <span className="mr-1.5 font-semibold text-ink-2">{o.key}.</span>
                          {o.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div>
                <label htmlFor={`text-${it.id}`} className="mb-3 block text-ink">
                  <span className="mr-2 text-sm font-semibold text-ink-2">Q{n + 1}.</span>
                  {it.prompt}
                  <span className="ml-2 text-xs text-ink-2">
                    ({it.points} pt{it.points === 1 ? "" : "s"}, marked by your teacher)
                  </span>
                </label>
                <textarea
                  id={`text-${it.id}`}
                  value={answers[it.id]?.textAnswer ?? ""}
                  onChange={(e) => change(it.id, { textAnswer: e.target.value })}
                  maxLength={10_000}
                  rows={6}
                  className="block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3 focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/30"
                />
              </div>
            )}
          </li>
        ))}
      </ol>

      {submitError && (
        <p role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
          {submitError}
        </p>
      )}
      {!canSubmit && blockedReason && <Banner tone="risk" title="Submissions are closed">{blockedReason}</Banner>}

      {confirming ? (
        <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-labelledby="confirm-h" aria-describedby="confirm-d" className="rounded-[var(--radius-card)] border border-brand bg-brand-soft p-4 outline-none">
          <p id="confirm-h" className="font-semibold text-ink">
            Submit your answers?
          </p>
          <p id="confirm-d" className="mt-1 text-sm text-ink-2">
            You can&apos;t change them afterwards.
            {unanswered > 0 && ` ${unanswered} item${unanswered === 1 ? " is" : "s are"} still unanswered and will score zero.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={submit} disabled={submitting} aria-busy={submitting} className={buttonClass("primary", "lg")}>
              {submitting ? "Submitting…" : "Yes, submit"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className={buttonClass("ghost", "lg")}>
              Keep working
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-16 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none lg:bottom-0">
          <button type="submit" disabled={!canSubmit} className={buttonClass("primary", "lg")}>
            Submit
          </button>
          <button type="button" onClick={() => void doSave()} disabled={save.kind === "saving"} className={buttonClass("secondary", "lg")}>
            Save draft
          </button>
          <p role="status" className={cn("text-sm", save.kind === "error" ? "text-risk" : "text-ink-2")}>
            {saveLabel}
          </p>
        </div>
      )}
    </form>
  );
}
