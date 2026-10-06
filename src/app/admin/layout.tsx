import type { ReactNode } from "react";
import { AppShell, TabNav, type NavItem } from "@/components/shell/app-shell";
import { requireRole } from "@/server/dal";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/curriculum", label: "Curriculum" },
  { href: "/admin/coverage", label: "Question coverage" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("admin");
  return (
    <AppShell user={user} areaLabel="Admin · CFA® Level I study tracker">
      <div className="pt-0">
        <TabNav
          items={NAV}
          label="Admin · CFA® Level I study tracker sections"
        />
        {children}
      </div>
    </AppShell>
  );
}
