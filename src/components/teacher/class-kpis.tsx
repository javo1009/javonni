import { Metric } from "@/components/ui";
import type { ClassOverview } from "@/services/classes";

/** The six cockpit tiles. All figures come from ClassOverview.kpis. */
export function ClassKpis({ kpis }: { kpis: ClassOverview["kpis"] }) {
  const hoursRatio =
    kpis.avgTargetHours > 0 ? kpis.avgHoursThisWeek / kpis.avgTargetHours : 0;
  return (
    <section
      aria-label="Class summary"
      className="grid grid-cols-1 gap-3.5 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      <Metric
        primary
        label="Avg chapters read"
        value={kpis.avgReadPct}
        unit="%"
        meter={kpis.avgReadPct / 100}
        hint={`${kpis.avgCompletePct}% fully reviewed on average`}
      />
      <Metric
        label="Avg hours this week"
        value={kpis.avgHoursThisWeek}
        unit={`/ ${kpis.avgTargetHours} h`}
        meter={Math.min(1, hoursRatio)}
        hint={
          kpis.total
            ? `${Math.round(hoursRatio * 100)}% of the weekly target`
            : "No students yet"
        }
      />
      <Metric
        label="Active this week"
        value={kpis.activeThisWeek}
        unit={`of ${kpis.total}`}
        meter={kpis.total ? kpis.activeThisWeek / kpis.total : 0}
        hint="Studied or practised in the last 7 days"
      />
      <Metric
        label="Behind the roadmap"
        value={kpis.behindRoadmap}
        unit={kpis.behindRoadmap === 1 ? "student" : "students"}
        hint={
          kpis.behindRoadmap
            ? "Chapters read trail the plan"
            : "Nobody is behind the plan"
        }
      />
      <Metric
        label="Avg latest mock"
        value={kpis.avgLatestMock ?? "—"}
        unit={kpis.avgLatestMock === null ? undefined : "%"}
        hint={
          kpis.avgLatestMock === null
            ? "No mock exams recorded yet"
            : "Each student's most recent mock"
        }
      />
      <Metric
        label="Homework on time"
        value={kpis.homeworkOnTimePct ?? "—"}
        unit={kpis.homeworkOnTimePct === null ? undefined : "%"}
        meter={
          kpis.homeworkOnTimePct === null
            ? undefined
            : kpis.homeworkOnTimePct / 100
        }
        hint={
          kpis.homeworkOnTimePct === null
            ? "Nothing has fallen due yet"
            : "Submitted by the due date"
        }
      />
    </section>
  );
}
