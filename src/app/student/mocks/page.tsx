import type { Metadata } from "next";
import { MocksView } from "@/components/tracker/mocks-view";
import { PageHeader } from "@/components/ui";
import { studentContext } from "@/server/context";
import { getTrackerSnapshot } from "@/services/tracker";

export const metadata: Metadata = { title: "Mock exams" };

export default async function MocksPage() {
  const { actor, db, today } = await studentContext();
  const snapshot = await getTrackerSnapshot(db, actor, actor.id, today);
  return (
    <>
      <PageHeader eyebrow="EXAM PRACTICE" title="Mock exams" description="Plan two full timed mocks before the exam. Record the score and what to revisit." />
      <div className="pb-6">
        <MocksView snapshot={snapshot} />
      </div>
    </>
  );
}
