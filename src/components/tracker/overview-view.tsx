"use client";

import { useMemo } from "react";
import { chapterCounts, topicCounts } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import {
  ForecastPanel,
  ReviewQueuePanel,
  WeakPracticePanel,
} from "./insight-panels";
import type { OnTab } from "./links";
import { ErrorBanner } from "./messages";
import {
  FocusPanel,
  MetricsRow,
  NextActionsPanel,
  PacePanel,
  RoadmapPanel,
} from "./overview-panels";
import { SectionHeading } from "./panel";
import { useChapterEditing } from "./use-chapter-editing";

/** Overview body: metrics, pace + focus, roadmap + next actions, then a few study insights. */
export function OverviewView({
  snapshot,
  readOnly = false,
  onTab,
}: {
  snapshot: TrackerSnapshot;
  readOnly?: boolean;
  onTab?: OnTab;
}) {
  const { chapters, update, error, clearError } = useChapterEditing(
    snapshot.chapters,
    snapshot.today,
    readOnly,
  );
  const counts = useMemo(() => chapterCounts(chapters), [chapters]);
  const byTopic = useMemo(() => topicCounts(chapters), [chapters]);

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={clearError} />
      <MetricsRow snapshot={snapshot} counts={counts} />
      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <PacePanel snapshot={snapshot} />
        <FocusPanel
          snapshot={snapshot}
          chapters={chapters}
          readOnly={readOnly}
          update={update}
          onTab={onTab}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <RoadmapPanel
          snapshot={snapshot}
          counts={byTopic}
          readOnly={readOnly}
          onTab={onTab}
        />
        <NextActionsPanel
          snapshot={snapshot}
          readOnly={readOnly}
          onTab={onTab}
        />
      </div>

      <SectionHeading
        eyebrow="STUDY INSIGHTS"
        title="Study smarter, not just longer"
      >
        What to review, whether you&apos;ll finish in time, and where to
        practise next.
      </SectionHeading>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ReviewQueuePanel
          snapshot={snapshot}
          chapters={chapters}
          readOnly={readOnly}
          update={update}
          onTab={onTab}
          limit={5}
        />
        <ForecastPanel snapshot={snapshot} counts={counts} />
        <WeakPracticePanel chapters={chapters} readOnly={readOnly} />
      </div>
    </div>
  );
}
