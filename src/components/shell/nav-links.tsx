"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  Gauge,
  LayoutGrid,
  ListChecks,
  Map,
  Sun,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

export const ICONS = {
  today: Sun,
  plan: CalendarDays,
  map: Map,
  practice: Target,
  homework: ClipboardList,
  cockpit: Gauge,
  classes: Users,
  questions: BookOpenCheck,
  coverage: LayoutGrid,
  import: Upload,
  checklist: ListChecks,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(path, it);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl justify-around">
        {items.slice(0, 5).map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(path, it);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand" : "text-ink-2")}
              >
                <Icon className="size-5" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
