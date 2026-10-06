import type { ReactNode } from "react";
import { AppShell, TabNav, type NavItem } from "@/components/shell/app-shell";
import { requireRole } from "@/server/dal";

const NAV: NavItem[] = [
  { href: "/teacher", label: "Class overview", exact: true },
  { href: "/teacher/homework", label: "Homework" },
  { href: "/teacher/questions", label: "Question bank" },
  { href: "/teacher/classes", label: "Classes" },
];

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("teacher", "admin");
  return (
    <AppShell user={user} areaLabel="Teacher · CFA® Level I study tracker">
      <div className="pt-0">
        <TabNav
          items={NAV}
          label="Teacher · CFA® Level I study tracker sections"
        />
        {children}
      </div>
    </AppShell>
  );
}
