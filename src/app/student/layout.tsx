import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav-links";
import { getCurriculum, studentContext } from "@/server/context";

const NAV: NavItem[] = [
  { href: "/student", label: "Today", icon: "today", exact: true },
  { href: "/student/plan", label: "Plan", icon: "plan" },
  { href: "/student/map", label: "Map", icon: "map" },
  { href: "/student/practice", label: "Practice", icon: "practice" },
  { href: "/student/homework", label: "Homework", icon: "homework" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user } = await studentContext();
  const c = await getCurriculum();
  return (
    <AppShell nav={NAV} user={user} areaLabel="Study" sampleCurriculum={c.version.isSample}>
      {children}
    </AppShell>
  );
}
