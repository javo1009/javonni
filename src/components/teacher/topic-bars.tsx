import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
} from "@/components/ui";
import type { ClassOverview } from "@/services/classes";

/** Class coverage and practice average per topic, in study order, with the weakest topic called out. */
export function TopicBars({
  overview,
}: {
  overview: Pick<ClassOverview, "topics" | "topicSummary" | "weakestTopic">;
}) {
  const { topics, topicSummary, weakestTopic } = overview;
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const weakest = weakestTopic
    ? topicById.get(weakestTopic.topicId)
    : undefined;
  return (
    <Card aria-labelledby="topics-h">
      <CardHeader
        id="topics-h"
        title="Class by topic"
        subtitle="Average share of chapters read, and average practice score where students have recorded one. Topics are in study order."
      />
      <CardBody className="space-y-5">
        {weakest && weakestTopic && (
          <div
            role="note"
            className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3"
          >
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-warn">
              Where the class needs help
            </p>
            <p className="mt-1 font-semibold text-ink">{weakest.name}</p>
            <p className="text-sm text-ink-2">{weakestTopic.reason}</p>
          </div>
        )}
        <ol className="space-y-4">
          {topicSummary.map((s) => {
            const t = topicById.get(s.topicId);
            const isWeakest = weakestTopic?.topicId === s.topicId;
            return (
              <li key={s.topicId}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="min-w-0 text-sm font-semibold text-ink">
                    {t?.name ?? "Topic"}
                    {t?.weightLabel && (
                      <span className="ml-2 text-xs font-medium text-ink-3">
                        {t.weightLabel}
                      </span>
                    )}
                    {isWeakest && (
                      <Badge tone="warn" className="ml-2 align-middle">
                        Weakest
                      </Badge>
                    )}
                  </p>
                  <p className="tabular text-sm text-ink-2">
                    <span className="font-semibold text-ink">
                      {s.avgReadPct}%
                    </span>{" "}
                    read
                    <span aria-hidden> · </span>
                    <span className="sr-only">, </span>
                    {s.avgAccuracy === null ? (
                      <span className="text-ink-3">no practice scores</span>
                    ) : (
                      <>
                        <span className="font-semibold text-ink">
                          {s.avgAccuracy}%
                        </span>{" "}
                        practice
                        <span className="text-ink-3">
                          {" "}
                          ({s.scoredStudents})
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <ProgressBar
                  value={s.avgReadPct}
                  max={100}
                  label={`${t?.name ?? "Topic"}: average share of chapters read`}
                  className="mt-1.5"
                />
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
