import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav-links";
import { getCurriculum, teacherContext } from "@/server/context";

const NAV: NavItem[] = [
  { href: "/teacher", label: "Cockpit", icon: "cockpit", exact: true },
  { href: "/teacher/classes", label: "Classes", icon: "classes" },
  { href: "/teacher/homework", label: "Homework", icon: "homework" },
  { href: "/teacher/questions", label: "Questions", icon: "questions" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user } = await teacherContext();
  const c = await getCurriculum();
  return (
    <AppShell nav={NAV} user={user} areaLabel="Teach" sampleCurriculum={c.version.isSample}>
      {children}
    </AppShell>
  );
}
