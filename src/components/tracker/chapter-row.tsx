"use client";

import { memo, useState } from "react";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { TRACKER } from "@/domain/tracker";
import { cn } from "@/lib/cn";
import { parseScore } from "@/lib/tracker-view";
import type { ChapterView } from "@/services/tracker";
import { practiceHref } from "./links";
import type { ChapterUpdate } from "./use-chapter-editing";

const STATUS_TEXT = {
  complete: "Fully reviewed",
  "in-progress": "In progress",
  "not-started": "Not started",
} as const;
export const CONFIDENCE_LABEL = { 1: "Shaky", 2: "OK", 3: "Solid" } as const;

function Check({
  label,
  checked,
  onChange,
  chapterTitle,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  chapterTitle: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8rem] whitespace-nowrap max-sm:min-h-11 max-sm:flex-1",
        checked
          ? "bg-brand-soft font-semibold text-brand"
          : "bg-surface-3 text-ink-2",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
        aria-label={`${label}: ${chapterTitle}`}
      />
      {label}
    </label>
  );
}

/** Practice score field: edits stay local until blur or Enter, then save; Escape puts the saved value back. */
function ScoreInput({
  chapter,
  update,
}: {
  chapter: ChapterView;
  update: ChapterUpdate;
}) {
  const saved = chapter.state.accuracy;
  const [draft, setDraft] = useState(saved === null ? "" : String(saved));
  const [error, setError] = useState<string | null>(null);
  // Follow the server value when it changes underneath us (another tab, practice session, import).
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setDraft(saved === null ? "" : String(saved));
  }

  function commit() {
    const r = parseScore(draft);
    if (!r.ok) return setError(r.error);
    setError(null);
    if (r.value === saved) return setDraft(saved === null ? "" : String(saved));
    setDraft(r.value === null ? "" : String(r.value));
    update(chapter.id, { accuracy: r.value });
  }

  const id = `score-${chapter.id}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[0.76rem] text-ink-2"
      >
        <span>Score</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={draft}
          placeholder="—"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-label={`Practice score for ${chapter.title}, percent`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(saved === null ? "" : String(saved));
              setError(null);
            }
          }}
          className="h-9 w-[4.5rem] rounded-[9px] border border-border-strong bg-surface-2 px-2 text-right text-sm text-ink placeholder:text-ink-3 focus:border-brand max-sm:h-11"
        />
        <span aria-hidden>%</span>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-risk">
          {error}
        </p>
      )}
    </div>
  );
}

function ChapterRowImpl({
  chapter: c,
  readOnly,
  update,
}: {
  chapter: ChapterView;
  readOnly: boolean;
  update: ChapterUpdate;
}) {
  const weak =
    c.state.accuracy !== null && c.state.accuracy < TRACKER.weakScore;
  const conf = c.state.confidence;
  const mismatch =
    c.state.accuracy !== null && conf === 3 && weak
      ? "Rated solid but scoring low"
      : c.state.accuracy !== null && conf === 1 && c.state.accuracy >= 80
        ? "Rated shaky but scoring well"
        : null;

  const name = (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="tabular min-w-[1.6rem] pt-0.5 text-xs font-bold text-ink-3">
        {String(c.number).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <strong className="block text-[0.9rem] font-semibold leading-snug text-ink">
          {c.title}
        </strong>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span>{STATUS_TEXT[c.status]}</span>
          {c.practice && (
            <span>
              · Platform questions {c.practice.correct}/{c.practice.attempts}
            </span>
          )}
          {weak && <Badge tone="warn">Below {TRACKER.weakScore}%</Badge>}
          {mismatch && <Badge tone="neutral">{mismatch}</Badge>}
          {c.reviewDue && (
            <Badge tone="warn">
              {c.reviewDue.kind === "first-review"
                ? "First review due"
                : "Refresh due"}
              {c.reviewDue.overdueDays > 0
                ? ` · ${c.reviewDue.overdueDays} d late`
                : " · today"}
            </Badge>
          )}
        </span>
      </div>
    </div>
  );

  if (readOnly)
    return (
      <li className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-4">
        {name}
        <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Progress">
          {(
            [
              ["Read", c.state.read],
              ["Questions", c.state.practice],
              ["Reviewed", c.state.review],
            ] as const
          ).map(([l, on]) => (
            <li
              key={l}
              className={cn(
                "rounded-[7px] px-2.5 py-1.5",
                on
                  ? "bg-brand-soft font-semibold text-brand"
                  : "bg-surface-3 text-ink-3",
              )}
            >
              {on ? "✓ " : "○ "}
              {l}
              <span className="sr-only">{on ? " (done)" : " (not done)"}</span>
            </li>
          ))}
        </ul>
        <p className="tabular text-sm text-ink-2">
          Score {c.state.accuracy === null ? "—" : `${c.state.accuracy}%`} ·{" "}
          {conf ? CONFIDENCE_LABEL[conf] : "Not rated"}
        </p>
      </li>
    );

  return (
    <li className="grid gap-2.5 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2/60 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-4">
      {name}
      <div className="flex flex-wrap gap-2 max-sm:[&>label]:flex-1">
        <Check
          label="Read"
          checked={c.state.read}
          onChange={(v) => update(c.id, { read: v })}
          chapterTitle={c.title}
        />
        <Check
          label="Questions"
          checked={c.state.practice}
          onChange={(v) => update(c.id, { practice: v })}
          chapterTitle={c.title}
        />
        <Check
          label="Reviewed"
          checked={c.state.review}
          onChange={(v) => update(c.id, { review: v })}
          chapterTitle={c.title}
        />
      </div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <ScoreInput key={c.id} chapter={c} update={update} />
        <label className="flex items-center gap-1.5 text-[0.76rem] text-ink-2">
          <span className="sr-only sm:not-sr-only">Confidence</span>
          <select
            value={conf ?? ""}
            onChange={(e) =>
              update(c.id, {
                confidence:
                  e.target.value === ""
                    ? null
                    : (Number(e.target.value) as 1 | 2 | 3),
              })
            }
            aria-label={`Confidence for ${c.title}`}
            className="h-9 rounded-[9px] border border-border-strong bg-surface-2 px-2 text-sm text-ink focus:border-brand max-sm:h-11"
          >
            <option value="">Not rated</option>
            <option value="1">1 · Shaky</option>
            <option value="2">2 · OK</option>
            <option value="3">3 · Solid</option>
          </select>
        </label>
        <ButtonLink
          href={practiceHref({ moduleId: c.id })}
          variant="ghost"
          size="sm"
          aria-label={`Practice questions for ${c.title}`}
          className="border border-border"
        >
          Practice
        </ButtonLink>
        {c.reviewDue && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => update(c.id, { reviewedToday: true })}
            aria-label={`Mark reviewed today: ${c.title}`}
          >
            Reviewed today
          </Button>
        )}
      </div>
    </li>
  );
}

export const ChapterRow = memo(ChapterRowImpl);
