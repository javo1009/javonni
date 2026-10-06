// Cohort heatmap: students × topics, cell = mastery level (+ hatch for no evidence).
// Rendered as a real <table> so it is navigable and readable without colour.
import Link from "next/link";
import { MasteryCell, levelFromMastery } from "./mastery";

export type HeatRow = { id: string; name: string; href?: string; cells: { topicId: string; mastery: number; hasEvidence: boolean }[] };

export function Heatmap({
  topics,
  rows,
  footer,
}: {
  topics: { id: string; code: string; name: string }[];
  rows: HeatRow[];
  footer?: { label: string; cells: { topicId: string; mastery: number }[] };
}) {
  return (
    <div role="region" aria-label="Students by topic mastery" tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-xs font-semibold text-ink-2">
              Student
            </th>
            {topics.map((t) => (
              <th key={t.id} scope="col" className="px-1 py-1 text-center text-xs font-semibold text-ink-2" title={t.name}>
                <abbr title={t.name} className="no-underline">
                  {t.code}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-surface px-2 py-1 text-left font-medium text-ink">
                {r.href ? (
                  <Link href={r.href} className="hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </th>
              {topics.map((t) => {
                const c = r.cells.find((x) => x.topicId === t.id);
                const m = c?.mastery ?? 0;
                const has = c?.hasEvidence ?? false;
                const label = `${r.name}, ${t.name}: ${has ? `${Math.round(m * 100)}% mastery` : "no evidence yet"}`;
                return (
                  <td key={t.id} className="p-0">
                    <MasteryCell level={levelFromMastery(m, has)} label={label} size="lg" />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-surface px-2 pt-2 text-left text-xs font-semibold text-ink-2">
                {footer.label}
              </th>
              {topics.map((t) => {
                const m = footer.cells.find((x) => x.topicId === t.id)?.mastery ?? 0;
                return (
                  <td key={t.id} className="tabular pt-2 text-center text-xs text-ink-2">
                    {Math.round(m * 100)}%
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
