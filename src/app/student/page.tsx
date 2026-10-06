import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { BackupControls } from "@/components/tracker/backup-controls";
import { OverviewView } from "@/components/tracker/overview-view";
import { SettingsForm } from "@/components/tracker/settings-form";
import { TimerChip } from "@/components/tracker/timer-chip";
import { overviewHeadline } from "@/lib/tracker-view";
import { studentContext } from "@/server/context";
import { getTrackerSnapshot } from "@/services/tracker";

export const metadata: Metadata = { title: "Overview" };

export default async function StudentOverviewPage() {
  const { actor, db, today } = await studentContext();
  const snapshot = await getTrackerSnapshot(db, actor, actor.id, today);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 -mt-2">
        <div className="min-h-8">
          <TimerChip />
        </div>
        <BackupControls />
      </div>
      <PageHeader
        eyebrow="YOUR PREPARATION"
        title={overviewHeadline(snapshot)}
        description={`A live view of your hours, chapter coverage and practice. ${snapshot.daysLeft} ${snapshot.daysLeft === 1 ? "day" : "days"} to go.`}
        actions={
          <SettingsForm
            examDate={snapshot.examDate}
            weeklyTargetHours={snapshot.weeklyTargetHours}
            today={snapshot.today}
          />
        }
      />
      <div className="pb-6">
        <OverviewView snapshot={snapshot} />
      </div>
    </>
  );
}
