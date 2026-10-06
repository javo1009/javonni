import { TableWrap, td, th } from "@/components/ui";
import { formatShortDate } from "@/lib/tracker-dates";
import { fmtHours, labelStep, niceTicks, weekRange } from "@/lib/tracker-view";
import { addDays } from "@/domain/dates";
import type { TrackerSnapshot } from "@/services/tracker";
import { cn } from "@/lib/cn";

/**
 * Hours per week against the weekly target, from the first plan week to the exam.
 * Bars start at zero; the dashed line is the target. Each column is labelled for assistive tech
 * and the same numbers are available as a table.
 */
export function WeeklyChart({
  weeks,
  targetHours,
  today,
}: {
  weeks: TrackerSnapshot["weeklyHours"];
  targetHours: number;
  today: string;
}) {
  const max = Math.max(targetHours * 1.15, ...weeks.map((w) => w.hours));
  const { max: top, ticks } = niceTicks(max, 4);
  const stepSm = labelStep(weeks.length, 8);
  const stepLg = labelStep(weeks.length, 20);
  const dense = weeks.length > 16;
  const pastWeeks = weeks.filter((w) => w.start <= today);
  const metCount = pastWeeks.filter((w) => w.hours >= targetHours).length;

  return (
    <figure>
      <figcaption className="mb-3 text-sm text-ink-2">
        {pastWeeks.length > 0 ? (
          <>
            You reached the {fmtHours(targetHours)} h target in{" "}
            <strong className="text-ink">{metCount}</strong> of{" "}
            {pastWeeks.length} weeks so far.
          </>
        ) : (
          "Your plan's first week hasn't started yet."
        )}
      </figcaption>
      <div className="flex gap-2">
        <div
          aria-hidden
          className="relative h-44 w-8 shrink-0 text-right text-[0.7rem] text-ink-3"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44 border-b border-border-strong">
            {ticks.map((t) => (
              <span
                aria-hidden
                key={t}
                className="absolute inset-x-0 border-t border-border"
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}
            <span
              aria-hidden
              className="absolute inset-x-0 z-10 border-t-2 border-dashed border-ink-2"
              style={{ bottom: `${(targetHours / top) * 100}%` }}
              title={`Weekly target: ${fmtHours(targetHours)} h`}
            />
            <div
              role="group"
              aria-label="Hours studied each week"
              className={cn(
                "absolute inset-0 z-[5] flex items-end",
                dense ? "gap-px" : "gap-1",
              )}
            >
              {weeks.map((w) => {
                const future = w.start > today;
                const met = w.hours >= targetHours;
                return (
                  <div
                    key={w.start}
                    role="img"
                    aria-label={`Week of ${formatShortDate(w.start)}: ${fmtHours(w.hours)} hours${future ? ", upcoming" : met ? ", target met" : `, ${fmtHours(targetHours - w.hours)} under target`}`}
                    title={`${weekRange(w.start, addDays(w.start, 6))} · ${fmtHours(w.hours)} h`}
                    className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
                  >
                    {!dense && w.hours > 0 && (
                      <span className="tabular mb-0.5 text-center text-[0.68rem] text-ink-2">
                        {fmtHours(w.hours)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "block w-full rounded-t-[4px]",
                        future && "hatch opacity-50",
                        !future &&
                          (met
                            ? "bg-gradient-to-t from-[var(--meter-from)] to-[var(--meter-to)]"
                            : "bg-m-2"),
                        w.current &&
                          "outline outline-2 outline-offset-1 outline-brand",
                      )}
                      style={{
                        height: future
                          ? "4px"
                          : `${Math.max(w.hours > 0 ? 2 : 0, (w.hours / top) * 100)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <ol
            aria-hidden
            className={cn("mt-1.5 flex", dense ? "gap-px" : "gap-1")}
          >
            {weeks.map((w, i) => (
              <li
                key={w.start}
                className={cn(
                  "min-w-0 flex-1 text-center text-[0.65rem] text-ink-3",
                  i % stepSm === 0 ? "block" : "hidden",
                  i % stepLg === 0 ? "sm:block" : "sm:hidden",
                  w.current && "font-bold text-ink",
                )}
              >
                <span className="inline-block whitespace-nowrap">
                  {formatShortDate(w.start)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.79rem] text-ink-3">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand" />
          Target met
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-m-2" />
          Under target
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="w-4 border-t-2 border-dashed border-ink-2"
          />
          Weekly target ({fmtHours(targetHours)} h)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="hatch size-2.5 rounded-sm opacity-60" />
          Upcoming week
        </li>
      </ul>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-link max-sm:min-h-11">
          Show the numbers as a table
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <TableWrap label="Hours studied per week">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Week</th>
                  <th className={th}>Hours</th>
                  <th className={th}>Against target</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start} className="border-t border-border">
                    <td className={td}>
                      {weekRange(w.start, addDays(w.start, 6))}
                      {w.current ? " (this week)" : ""}
                    </td>
                    <td className={cn(td, "tabular")}>{fmtHours(w.hours)} h</td>
                    <td className={cn(td, "text-ink-2")}>
                      {w.start > today
                        ? "Upcoming"
                        : w.hours >= targetHours
                          ? "Target met"
                          : `${fmtHours(targetHours - w.hours)} h under`}
                    </td>
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
