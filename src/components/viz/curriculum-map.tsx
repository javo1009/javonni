// Curriculum map: topics sized by exam weight, one cell per LOS (UX-DESIGN.md §4).
// Layout is a flex "treemap": tile width grows with the topic's weight midpoint.
import Link from "next/link";
import type { LosStatus } from "@/domain/status";
import { LOS_STATUS_LABEL } from "@/domain/status";
import { MasteryCell, levelFromStatus } from "./mastery";

export type MapTopic = {
  id: string;
  code: string;
  name: string;
  weightMin: number;
  weightMax: number;
  proficientPct: number;
  los: { id: string; code: string; text: string; status: LosStatus; mastery: number }[];
};

export function CurriculumMap({ topics, hrefForLos }: { topics: MapTopic[]; hrefForLos?: (id: string) => string }) {
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Curriculum map by topic">
      {topics.map((t) => {
        const w = (t.weightMin + t.weightMax) / 2;
        return (
          <div
            key={t.id}
            role="listitem"
            className="flex min-w-[9.5rem] flex-col rounded-lg border border-border bg-surface p-3"
            style={{ flexGrow: w, flexBasis: `${w * 1.1}rem` }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-ink" title={t.name}>
                {t.name}
              </h3>
              <span className="tabular shrink-0 text-xs text-ink-2">
                {t.weightMin}–{t.weightMax}%
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1" aria-label={`${t.name} objectives`}>
              {t.los.map((l) => {
                const label = `${l.code}: ${LOS_STATUS_LABEL[l.status]}${l.mastery > 0 ? `, mastery ${Math.round(l.mastery * 100)}%` : ""}`;
                const cell = (
                  <MasteryCell level={levelFromStatus(l.status, l.mastery)} reviewDue={l.status === "review_due"} label={label} />
                );
                return (
                  <li key={l.id}>
                    {hrefForLos ? (
                      <Link href={hrefForLos(l.id)} className="block rounded-[3px]" aria-label={label}>
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="tabular mt-auto pt-2 text-xs text-ink-2">{Math.round(t.proficientPct * 100)}% proficient</p>
          </div>
        );
      })}
    </div>
  );
}
