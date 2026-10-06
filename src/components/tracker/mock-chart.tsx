import { TableWrap, td, th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/tracker-dates";
import { fmtHours } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";

type Mock = TrackerSnapshot["mocks"]["items"][number];
const TICKS = [0, 25, 50, 75, 100];

/** Score per mock, oldest to newest, on a 0 to 100 axis. Every bar carries its value and date; a table repeats the numbers. */
export function MockChart({ items }: { items: Mock[] }) {
  const chrono = [...items].reverse();
  const dense = chrono.length > 8;
  return (
    <figure>
      <figcaption className="sr-only">Mock exam scores over time, as a percentage</figcaption>
      <div className="flex gap-2">
        <div aria-hidden className="relative h-44 w-9 shrink-0 text-right text-[0.7rem] text-ink-3">
          {TICKS.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - t}%` }}>
              {t}%
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44 border-b border-border-strong">
            {TICKS.map((t) => (
              <span aria-hidden key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${t}%` }} />
            ))}
            <ol className={cn("absolute inset-0 z-[5] flex items-end justify-around", dense ? "gap-1" : "gap-3")}>
              {chrono.map((m) => (
                <li
                  key={m.id}
                  role="img"
                  aria-label={`${formatShortDate(m.date)}: ${fmtHours(m.score)} percent`}
                  className="flex h-full min-w-0 max-w-[4.5rem] flex-1 flex-col justify-end"
                >
                  <span className="tabular mb-1 text-center text-[0.8rem] font-bold text-ink">{fmtHours(m.score)}%</span>
                  <span className="block w-full rounded-t-[5px] bg-gradient-to-t from-[var(--meter-from)] to-[var(--meter-to)]" style={{ height: `${Math.max(2, m.score)}%` }} />
                </li>
              ))}
            </ol>
          </div>
          <ol aria-hidden className={cn("mt-1.5 flex justify-around", dense ? "gap-1" : "gap-3")}>
            {chrono.map((m) => (
              <li key={m.id} className="min-w-0 max-w-[4.5rem] flex-1 text-center text-[0.7rem] text-ink-3">
                {formatShortDate(m.date)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-link max-sm:min-h-11">Show the numbers as a table</summary>
        <div className="mt-2">
          <TableWrap label="Mock exam scores">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Score</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {chrono.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className={td}>{formatShortDate(m.date)}</td>
                    <td className={cn(td, "tabular")}>{fmtHours(m.score)}%</td>
                    <td className={cn(td, "text-ink-2")}>{m.note || "No note"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </details>
    </figure>
  );
}
