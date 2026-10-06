// Readiness as a band, never a fake-precise number (UX-DESIGN.md §4).
import type { Readiness } from "@/domain/readiness";
import { cn } from "@/lib/cn";
import { Sparkline } from "./sparkline";

const evidenceText = { low: "Evidence: low", moderate: "Evidence: moderate", high: "Evidence: high" } as const;

export function ReadinessBand({ r, trend, className }: { r: Readiness; trend?: number[]; className?: string }) {
  if (r.insufficient) {
    return (
      <div className={className}>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Readiness</p>
        <p className="mt-1 text-2xl font-semibold text-ink-3">—</p>
        <p className="mt-0.5 text-sm text-ink-2">Answer a few practice questions to see this.</p>
      </div>
    );
  }
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Readiness</p>
      <div className="mt-1 flex items-end gap-3">
        <p className="tabular text-2xl font-semibold text-ink" aria-label={`Readiness ${r.low} to ${r.high}`}>
          {r.low}–{r.high}
        </p>
        {trend && trend.length > 1 && <Sparkline values={trend} label="Readiness, last 4 weeks" className="mb-1.5" />}
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-surface-2" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-brand/35" style={{ left: `${r.low}%`, width: `${Math.max(1, r.high - r.low)}%` }} />
        <div className="absolute inset-y-[-3px] w-[3px] rounded-full bg-brand" style={{ left: `calc(${r.mid}% - 1.5px)` }} />
      </div>
      <p className={cn("mt-1.5 text-sm text-ink-2")}>{evidenceText[r.evidenceLabel]} · not a pass prediction</p>
    </div>
  );
}
