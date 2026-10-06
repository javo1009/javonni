import { Flame } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDay, formatMinutes, plural } from "@/lib/format";
import type { TrackerSnapshot } from "@/services/tracker";
import { Panel } from "./panel";

const LEVEL_CLASS = ["hatch", "bg-m-1", "bg-m-2", "bg-m-3", "bg-m-4"] as const;
const LEVEL_NAME = ["No study", "Light", "Some", "On target", "Big day"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Streaks plus a 12-week heat grid (columns are weeks, rows are weekdays). */
export function StreakPanel({ consistency, weeklyTargetHours }: { consistency: TrackerSnapshot["consistency"]; weeklyTargetHours: number }) {
  const { currentStreak, longestStreak, activeDays28, weeks } = consistency;
  const dailyTarget = Math.round((weeklyTargetHours * 60) / 7);
  return (
    <Panel
      id="streak-title"
      eyebrow="CONSISTENCY"
      title="Streak and study days"
      action={
        currentStreak > 0 ? (
          <Badge tone="good">
            <Flame aria-hidden className="size-3.5" />
            {plural(currentStreak, "day")} in a row
          </Badge>
        ) : (
          <Badge>No current streak</Badge>
        )
      }
    >
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-sm text-ink-2">Current streak</dt>
          <dd className="tabular text-3xl font-bold tracking-tight text-ink">
            {currentStreak}
            <span className="ml-1 text-sm font-normal text-ink-3">{currentStreak === 1 ? "day" : "days"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-2">Best streak</dt>
          <dd className="tabular text-3xl font-bold tracking-tight text-ink">
            {longestStreak}
            <span className="ml-1 text-sm font-normal text-ink-3">{longestStreak === 1 ? "day" : "days"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-2">Active, last 4 weeks</dt>
          <dd className="tabular text-3xl font-bold tracking-tight text-ink">
            {activeDays28}
            <span className="ml-1 text-sm font-normal text-ink-3">/ 28 days</span>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-ink-2">Short, regular sessions beat occasional marathons: steady study is one of the best predictors of retention.</p>

      <div className="mt-4 flex gap-2" role="group" aria-label="Study days over the last 12 weeks">
        <div aria-hidden className="grid grid-rows-7 gap-[3px] pt-0 text-[0.65rem] leading-none text-ink-3">
          {DAYS.map((d, i) => (
            <span key={d} className="flex items-center">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.flatMap((week) =>
            week.map((d) => (
              <span
                key={d.date}
                role="img"
                aria-label={`${formatDay(d.date)}: ${d.future ? "upcoming" : d.minutes > 0 ? formatMinutes(d.minutes) : "no study"}`}
                title={`${formatDay(d.date)} · ${d.future ? "upcoming" : d.minutes > 0 ? formatMinutes(d.minutes) : "no study"}`}
                className={cn("aspect-square w-full rounded-[3px]", d.future ? "border border-dashed border-border" : LEVEL_CLASS[d.level], d.level === 0 && !d.future && "border border-border")}
              />
            )),
          )}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-ink-3" aria-label="Legend">
        {LEVEL_NAME.map((n, i) => (
          <li key={n} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-[3px]", LEVEL_CLASS[i], i === 0 && "border border-border")} />
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-ink-3">&ldquo;On target&rdquo; is about {formatMinutes(dailyTarget)} a day at your weekly target. Oldest week on the left.</p>
    </Panel>
  );
}
