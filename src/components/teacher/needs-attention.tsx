import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { Alert } from "@/domain/alerts";
import { ALERT_LABEL } from "@/lib/class-roster";
import { plural } from "@/lib/format";

const VISIBLE = 6;

function AttentionCard({ alerts }: { alerts: Alert[] }) {
  const { studentId, name } = alerts[0];
  const worst = alerts[0].severity;
  return (
    <li className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/teacher/students/${studentId}`}
          className="min-w-0 truncate text-base font-semibold text-link hover:underline"
        >
          {name}
        </Link>
        <Badge tone={worst === "high" ? "risk" : "warn"}>
          {worst === "high" ? "▲ High priority" : "● Keep an eye"}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <li key={a.kind} className="text-sm">
            <span className="font-semibold text-ink">
              {ALERT_LABEL[a.kind]}
            </span>
            {a.severity === "high" && (
              <span className="sr-only"> (high priority)</span>
            )}
            <span className="block text-ink-2">{a.evidence}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** One card per student with their alert reasons; the alert engine already orders them most severe first. */
export function NeedsAttention({ groups }: { groups: Alert[][] }) {
  const shown = groups.slice(0, VISIBLE);
  const rest = groups.slice(VISIBLE);
  return (
    <Card aria-labelledby="attention-h">
      <CardHeader
        id="attention-h"
        title="Needs attention"
        subtitle={
          groups.length
            ? `${plural(groups.length, "student")} flagged, most urgent first.`
            : undefined
        }
      />
      <CardBody>
        {groups.length === 0 ? (
          <EmptyState title="Everyone is on track">
            No student is inactive, behind on hours or the roadmap, or missing
            homework right now.
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((g) => (
                <AttentionCard key={g[0].studentId} alerts={g} />
              ))}
            </ul>
            {rest.length > 0 && (
              <details className="group mt-3">
                <summary className="cursor-pointer rounded-md py-2 text-sm font-semibold text-link hover:underline max-sm:min-h-11">
                  <span className="group-open:hidden">
                    Show {rest.length} more
                  </span>
                  <span className="hidden group-open:inline">Show fewer</span>
                </summary>
                <ul className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rest.map((g) => (
                    <AttentionCard key={g[0].studentId} alerts={g} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
