import type { Metadata } from "next";
import { ChaptersView } from "@/components/tracker/chapters-view";
import { TimerChip } from "@/components/tracker/timer-chip";
import { PageHeader } from "@/components/ui";
import { parseFilterParams } from "@/lib/tracker-view";
import { studentContext } from "@/server/context";
import { getTrackerSnapshot } from "@/services/tracker";

export const metadata: Metadata = { title: "All chapters" };

export default async function ChaptersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, { actor, db, today }] = await Promise.all([
    searchParams,
    studentContext(),
  ]);
  const snapshot = await getTrackerSnapshot(db, actor, actor.id, today);
  const filter = parseFilterParams(params, snapshot.topics);
  const read = snapshot.totals.read;
  return (
    <>
      <PageHeader
        eyebrow="ALL CHAPTERS"
        title="Every module, one checklist."
        description={`${read} of ${snapshot.totals.total} chapters read so far. Tick things off as you go; changes save instantly.`}
        actions={<TimerChip />}
      />
      <div className="pb-6">
        {/* Remount when the link's filter changes (e.g. clicking a roadmap topic while already on this page). */}
        <ChaptersView
          key={JSON.stringify(filter)}
          snapshot={snapshot}
          initialFilter={filter}
        />
      </div>
    </>
  );
}
