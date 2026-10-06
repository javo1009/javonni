import type { ReactNode } from "react";
import { AppShell, TabNav, type NavItem } from "@/components/shell/app-shell";
import { requireRole } from "@/server/dal";

const NAV: NavItem[] = [
  { href: "/student", label: "Overview", exact: true },
  { href: "/student/chapters", label: "All chapters" },
  { href: "/student/hours", label: "Study hours" },
  { href: "/student/mocks", label: "Mock exams" },
  { href: "/student/homework", label: "Homework" },
  { href: "/student/practice", label: "Practice" },
];

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("student");
  return (
    <AppShell user={user} areaLabel="Student · CFA® Level I study tracker">
      <div className="pt-0">
        <TabNav
          items={NAV}
          label="Student · CFA® Level I study tracker sections"
        />
        {children}
      </div>
    </AppShell>
  );
}
