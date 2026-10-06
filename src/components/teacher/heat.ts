import type { HeatRow } from "@/components/viz/heatmap";
import type { StudentRow } from "@/services/classes";

/** Heatmap rows from class-overview students; a cell has evidence once any objective in the topic was attempted. */
export function heatRows(students: StudentRow[]): HeatRow[] {
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    href: `/teacher/students/${s.id}`,
    cells: [...s.snapshot.topicStats].map(([topicId, st]) => ({
      topicId,
      mastery: st.mastery,
      hasEvidence: (s.readiness.topics.find((t) => t.topicId === topicId)?.attemptedShare ?? 0) > 0,
    })),
  }));
}

/** Name order by default; readiness or a topic code sorts weakest first. */
export function sortStudents(students: StudentRow[], sort: string | undefined, topicIdByCode: Map<string, string>) {
  const list = [...students];
  if (sort === "readiness") return list.sort((a, b) => a.readiness.mid - b.readiness.mid || a.name.localeCompare(b.name));
  const topicId = sort ? topicIdByCode.get(sort) : undefined;
  if (topicId)
    return list.sort(
      (a, b) => (a.snapshot.topicStats.get(topicId)?.mastery ?? 0) - (b.snapshot.topicStats.get(topicId)?.mastery ?? 0) || a.name.localeCompare(b.name),
    );
  return list;
}

