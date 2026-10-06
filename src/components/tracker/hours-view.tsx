import { MIXED_TOPIC_LIST } from "./constants";
import { formatMinutes } from "@/lib/format";
import { fmtHours } from "@/lib/tracker-view";
import type { TrackerSnapshot } from "@/services/tracker";
import { FocusTimer } from "./focus-timer";
import { Panel } from "./panel";
import { SessionForm } from "./session-form";
import { SessionList } from "./session-list";
import { StreakPanel } from "./streak-panel";
import { WeeklyChart } from "./weekly-chart";

/** Study hours: timer and log form beside the weekly chart, streaks and recent sessions. Read-only drops the timer and form. */
export function HoursView({
  snapshot,
  readOnly = false,
}: {
  snapshot: TrackerSnapshot;
  readOnly?: boolean;
}) {
  const topicNames = [
    ...snapshot.topics.map((t) => t.name),
    ...MIXED_TOPIC_LIST,
  ];
  const focusTopic =
    snapshot.focus.kind === "topic"
      ? snapshot.topics.find(
          (t) => t.id === (snapshot.focus as { topicId: string }).topicId,
        )?.name
      : undefined;
  const defaultTopic = focusTopic ?? "Mixed review";
  const { sessions, week, weeklyTargetHours } = snapshot;

  const history = (
    <div className="space-y-4">
      <Panel
        id="weekly-title"
        eyebrow="YOUR HISTORY"
        title="Weekly hours"
        action={
          <strong className="tabular text-sm font-semibold text-ink">
            {formatMinutes(sessions.totalMinutes)} total ·{" "}
            {fmtHours(week.hours)} h this week
          </strong>
        }
      >
        <WeeklyChart
          weeks={snapshot.weeklyHours}
          targetHours={weeklyTargetHours}
          today={snapshot.today}
        />
      </Panel>
      <StreakPanel
        consistency={snapshot.consistency}
        weeklyTargetHours={weeklyTargetHours}
      />
      <Panel id="recent-title" eyebrow="LOG" title="Recent sessions">
        <SessionList
          sessions={sessions.recent}
          count={sessions.count}
          readOnly={readOnly}
        />
      </Panel>
    </div>
  );

  if (readOnly) return history;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <FocusTimer
          topics={topicNames}
          defaultTopic={defaultTopic}
          today={snapshot.today}
        />
        <SessionForm
          topics={topicNames}
          defaultTopic={defaultTopic}
          today={snapshot.today}
        />
      </div>
      {history}
    </div>
  );
}
