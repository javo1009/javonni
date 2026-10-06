import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav-links";
import { adminContext, getCurriculumOrNull } from "@/server/context";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "cockpit", exact: true },
  { href: "/admin/curriculum", label: "Curriculum", icon: "import" },
  { href: "/admin/coverage", label: "Coverage", icon: "coverage" },
  { href: "/admin/users", label: "Users", icon: "classes" },
  { href: "/teacher", label: "Teacher view", icon: "checklist" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await adminContext();
  const c = await getCurriculumOrNull();
  return (
    <AppShell nav={NAV} user={user} areaLabel="Admin" sampleCurriculum={c?.version.isSample ?? false}>
      {children}
    </AppShell>
  );
}
