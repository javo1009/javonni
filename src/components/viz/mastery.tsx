// Shared mastery encoding: one ordinal teal ramp + hatch for "not started" +
// a warning dot for "review due". Every cell also carries a text label (aria/tooltip).
import type { LosStatus } from "@/domain/status";
import { LOS_STATUS_LABEL } from "@/domain/status";
import { cn } from "@/lib/cn";

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

const fill: Record<MasteryLevel, string> = {
  0: "hatch",
  1: "bg-m-1",
  2: "bg-m-2",
  3: "bg-m-3",
  4: "bg-m-4",
};

/** Continuous mastery (0..1) -> level. 0 means no evidence. */
export function levelFromMastery(m: number, hasEvidence: boolean): MasteryLevel {
  if (!hasEvidence) return 0;
  if (m < 0.4) return 1;
  if (m < 0.6) return 2;
  if (m < 0.75) return 3;
  return 4;
}

/** LOS status -> level (review_due keeps the colour of its mastery, plus a dot). */
export function levelFromStatus(s: LosStatus, mastery: number): MasteryLevel {
  switch (s) {
    case "not_started":
      return 0;
    case "studied":
      return 1;
    case "practiced":
      return mastery >= 0.6 ? 3 : 2;
    case "proficient":
      return 4;
    case "review_due":
      return mastery >= 0.6 ? 3 : 2;
  }
}

export function MasteryCell({
  level,
  reviewDue,
  label,
  size = "md",
  className,
}: {
  level: MasteryLevel;
  reviewDue?: boolean;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = size === "sm" ? "size-3.5" : size === "lg" ? "h-9 w-full min-w-9" : "size-5";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("relative inline-block shrink-0 rounded-[3px] ring-1 ring-inset ring-border-strong/70", fill[level], dims, className)}
    >
      {reviewDue && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warn ring-2 ring-surface" />}
    </span>
  );
}

export function MasteryLegend({ className }: { className?: string }) {
  const items: { level: MasteryLevel; label: string; review?: boolean }[] = [
    { level: 0, label: LOS_STATUS_LABEL.not_started },
    { level: 1, label: LOS_STATUS_LABEL.studied },
    { level: 2, label: "Practising" },
    { level: 3, label: "Getting there" },
    { level: 4, label: LOS_STATUS_LABEL.proficient },
    { level: 3, label: LOS_STATUS_LABEL.review_due, review: true },
  ];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2", className)} aria-label="Mastery legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <MasteryCell level={i.level} reviewDue={i.review} label={i.label} size="sm" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
