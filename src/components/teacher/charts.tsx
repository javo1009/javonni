// Small teacher charts. Single axis, zero-based bars, brand hue for "done"/magnitude and
// a neutral outline for "planned". Every value is also printed as text or in a table.
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/** 14-day planned vs studied minutes, one column per day. */
export function AdherenceChart({ days }: { days: { date: string; planned: number; done: number }[] }) {
  const max = Math.max(30, ...days.map((d) => Math.max(d.planned, d.done)));
  const planned = days.reduce((s, d) => s + d.planned, 0);
  const done = days.reduce((s, d) => s + d.done, 0);
  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[3px] bg-brand" /> Studied
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[3px] border-2 border-dashed border-ink-3" /> Planned
        </span>
      </div>
      <div className="flex h-32 items-end gap-[2px] border-b border-border" aria-hidden>
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center" title={`${formatShortDate(d.date)}: planned ${d.planned} min, studied ${d.done} min`}>
            {d.planned > 0 && (
              <div
                className="absolute bottom-0 w-full max-w-7 rounded-t-[4px] border-2 border-b-0 border-dashed border-ink-3"
                style={{ height: `${(d.planned / max) * 100}%` }}
              />
            )}
            {d.done > 0 && (
              <div className="relative w-[60%] max-w-4 rounded-t-[4px] bg-brand" style={{ height: `${(d.done / max) * 100}%` }} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-ink-3" aria-hidden>
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {i % 2 === 0 || i === days.length - 1 ? formatShortDate(d.date).split(" ")[0] : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-ink-2">
        {planned > 0
          ? `Studied ${Math.round(done / 6) / 10} h of ${Math.round(planned / 6) / 10} h planned over 14 days (${Math.round((Math.min(done, planned) / planned) * 100)}%).`
          : `No plan tasks in the last 14 days; studied ${Math.round(done / 6) / 10} h.`}
      </figcaption>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-brand hover:underline">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Planned and studied minutes per day</caption>
          <thead>
            <tr className="text-xs text-ink-2">
              <th scope="col" className="py-1 font-semibold">Date</th>
              <th scope="col" className="py-1 text-right font-semibold">Planned (min)</th>
              <th scope="col" className="py-1 text-right font-semibold">Studied (min)</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-border">
                <th scope="row" className="py-1 font-normal text-ink">{formatShortDate(d.date)}</th>
                <td className="py-1 text-right text-ink">{d.planned}</td>
                <td className="py-1 text-right text-ink">{d.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Mastery by topic as labelled bars (0–100%). */
export function TopicMasteryBars({
  rows,
}: {
  rows: { id: string; code: string; name: string; weight: string; mastery: number; coverage: number; hasEvidence: boolean; belowFloor: boolean }[];
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Mastery and coverage by topic</caption>
      <thead>
        <tr className="text-left text-xs text-ink-2">
          <th scope="col" className="pb-2 font-semibold">Topic</th>
          <th scope="col" className="w-[45%] pb-2 font-semibold">Mastery</th>
          <th scope="col" className="pb-2 text-right font-semibold">Covered</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              <span className="block font-medium text-ink">{r.name}</span>
              <span className="text-xs text-ink-2">{r.weight} of exam</span>
            </th>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2">
                <div className={cn("h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2", !r.hasEvidence && "hatch")} aria-hidden>
                  {r.hasEvidence && <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, r.mastery * 100)}%` }} />}
                </div>
                <span className="tabular w-24 shrink-0 text-right text-ink">
                  {r.hasEvidence ? `${Math.round(r.mastery * 100)}%` : "No data"}
                  {r.belowFloor && <span className="ml-1 text-xs font-medium text-warn">▼ low</span>}
                </span>
              </div>
            </td>
            <td className="tabular py-2 text-right text-ink-2">{Math.round(r.coverage * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Completion funnel: targeted → started → submitted → graded. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 text-sm">
          <span className="text-ink-2">{s.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
          <span className="tabular text-right font-medium text-ink">
            {s.value}
            <span className="font-normal text-ink-2"> · {Math.round((s.value / max) * 100)}%</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Answer-choice distribution for one MCQ, correct answer and common wrong answer called out in text. */
export function ChoiceDistribution({
  options,
  counts,
  correctKey,
  commonWrongKey,
}: {
  options: { key: string; text: string }[];
  counts: Record<string, number>;
  correctKey: string;
  commonWrongKey: string | null;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <ul className="space-y-1.5" aria-label="Answer choices chosen">
      {options.map((o) => {
        const n = counts[o.key] ?? 0;
        const share = total ? n / total : 0;
        const correct = o.key === correctKey;
        const wrongHot = o.key === commonWrongKey;
        return (
          <li key={o.key} className={cn("rounded-lg px-2 py-1.5", wrongHot && "bg-warn-soft", correct && "bg-good-soft")}>
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 text-ink">
                <span className="font-semibold">{o.key}.</span> {o.text}
                {correct && <span className="ml-2 text-xs font-semibold text-good">✓ Correct</span>}
                {wrongHot && <span className="ml-2 text-xs font-semibold text-warn">▲ Common wrong answer</span>}
              </span>
              <span className="tabular shrink-0 text-ink-2">
                {n} · {Math.round(share * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div className={cn("h-full rounded-full", correct ? "bg-good" : wrongHot ? "bg-warn" : "bg-ink-3")} style={{ width: `${share * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
