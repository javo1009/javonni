"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Play, RotateCcw } from "lucide-react";
import { setTaskStatus } from "@/app/actions/student";
import { buttonClass } from "@/components/ui";
import { formatMinutes } from "@/domain/assessment";
import { dayLabel as formatDay } from "./dates";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/services/student-views";

const TYPE_LABEL: Record<TaskView["type"], string> = {
  read: "Read",
  practice: "Practice",
  review: "Review",
  quiz: "Quiz",
  mock: "Mock exam",
  mock_review: "Mock review",
  final_review: "Final review",
};

/** Left accent per task type; the type is always also written out. */
const TYPE_ACCENT: Record<TaskView["type"], string> = {
  read: "border-l-brand",
  practice: "border-l-m-2",
  quiz: "border-l-m-2",
  review: "border-l-m-1",
  final_review: "border-l-m-1",
  mock: "border-l-ink",
  mock_review: "border-l-ink-3",
};

/** Strip the "Read · " prefix the generator adds; the type is shown separately. */
const shortTitle = (t: TaskView) => t.title.replace(/^[^·]+·\s*/, "");

export function TaskRow({ task, showDate = false, overdue = false }: { task: TaskView; showDate?: boolean; overdue?: boolean }) {
  const [opt, setOpt] = useOptimistic({ status: task.status, actual: task.actualMinutes });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(String(task.actualMinutes ?? task.minutes));

  const update = (status: TaskView["status"], actualMinutes?: number) => {
    setError(null);
    startTransition(async () => {
      setOpt({ status, actual: status === "done" ? (actualMinutes ?? task.minutes) : null });
      const r = await setTaskStatus({ itemId: task.id, status, actualMinutes });
      if (!r.ok) setError(r.error);
      else setAnnounce(status === "done" ? `${shortTitle(task)} marked done.` : status === "skipped" ? `${shortTitle(task)} skipped.` : `${shortTitle(task)} moved back to to-do.`);
    });
  };

  const saveMinutes = () => {
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < 1 || n > 720) {
      setError("Enter whole minutes between 1 and 720.");
      return;
    }
    setEditing(false);
    update("done", n);
  };

  const done = opt.status === "done";
  const skipped = opt.status === "skipped";
  const inputId = `mins-${task.id}`;

  return (
    <li className={cn("border-l-4 bg-surface py-3 pl-3 pr-4", TYPE_ACCENT[task.type], (done || skipped) && "bg-surface-2/60")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => update(done ? "todo" : "done")}
          disabled={pending}
          aria-pressed={done}
          aria-label={done ? `Mark not done: ${task.title}` : `Mark done: ${task.title}`}
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:size-9",
            done ? "border-brand bg-brand text-brand-ink" : "border-border-strong text-ink-3/40 hover:border-brand hover:text-brand",
          )}
        >
          <Check className="size-5" aria-hidden strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className={cn("font-medium text-ink", skipped && "text-ink-2 line-through decoration-ink-3")}>
              <span className="text-ink-2">{TYPE_LABEL[task.type]} · </span>
              {shortTitle(task)}
            </p>
            <p className="tabular shrink-0 text-sm text-ink-2">
              {done && opt.actual !== null && opt.actual !== task.minutes ? (
                <>
                  {formatMinutes(opt.actual)} <span className="text-ink-3">of {formatMinutes(task.minutes)}</span>
                </>
              ) : (
                formatMinutes(task.minutes)
              )}
            </p>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {showDate && <span className={cn(overdue && "font-medium text-warn")}>{overdue ? `From ${formatDay(task.date)}` : formatDay(task.date)} · </span>}
            {task.topicName ?? "Mixed topics"}
            {task.losCount > 0 && ` · ${task.losCount} objective${task.losCount === 1 ? "" : "s"}`}
            {done && <span className="font-medium text-good"> · Done</span>}
            {skipped && <span className="font-medium text-ink-2"> · Skipped</span>}
          </p>

          {editing ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={inputId} className="block text-xs font-medium text-ink-2">
                  Minutes spent
                </label>
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={720}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveMinutes();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="mt-1 h-11 w-24 rounded-lg border border-border-strong bg-surface px-3 text-ink sm:h-9"
                />
              </div>
              <button type="button" onClick={saveMinutes} className={buttonClass("primary", "sm", "max-sm:min-h-11")}>
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className={buttonClass("ghost", "sm", "max-sm:min-h-11")}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!done && !skipped && task.practiceHref && (
                <Link href={task.practiceHref} className={buttonClass("secondary", "sm", "max-sm:min-h-11")}>
                  <Play className="size-3.5" aria-hidden /> Start
                </Link>
              )}
              {!done && !skipped && (
                <>
                  <button type="button" onClick={() => setEditing(true)} disabled={pending} className={buttonClass("ghost", "sm", "max-sm:min-h-11")}>
                    Log different time
                  </button>
                  <button type="button" onClick={() => update("skipped")} disabled={pending} className={buttonClass("ghost", "sm", "max-sm:min-h-11")}>
                    Skip
                  </button>
                </>
              )}
              {done && (
                <button type="button" onClick={() => setEditing(true)} disabled={pending} className={buttonClass("ghost", "sm", "max-sm:min-h-11")}>
                  Edit time
                </button>
              )}
              {(done || skipped) && (
                <button type="button" onClick={() => update("todo")} disabled={pending} className={buttonClass("ghost", "sm", "max-sm:min-h-11")}>
                  <RotateCcw className="size-3.5" aria-hidden /> Undo
                </button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-risk">
              {error}
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
        </div>
      </div>
    </li>
  );
}

export function TaskList({ tasks, showDate, overdue, label }: { tasks: TaskView[]; showDate?: boolean; overdue?: boolean; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showDate={showDate} overdue={overdue} />
      ))}
    </ul>
  );
}
