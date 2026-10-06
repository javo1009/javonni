import type { Metadata } from "next";
import { HoursView } from "@/components/tracker/hours-view";
import { PageHeader } from "@/components/ui";
import { fmtHours } from "@/lib/tracker-view";
import { studentContext } from "@/server/context";
import { getTrackerSnapshot } from "@/services/tracker";

export const metadata: Metadata = { title: "Study hours" };

export default async function HoursPage() {
  const { actor, db, today } = await studentContext();
  const snapshot = await getTrackerSnapshot(db, actor, actor.id, today);
  const { week } = snapshot;
  return (
    <>
      <PageHeader
        eyebrow="CONSISTENCY"
        title="Study hours"
        description={`Log focused study time, including questions and mock review. This week: ${fmtHours(week.hours)} of ${fmtHours(week.targetHours)} hours.`}
      />
      <div className="pb-6">
        <HoursView snapshot={snapshot} />
      </div>
    </>
  );
}
