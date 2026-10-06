"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = {
  href: string;
  label: string;
  /** Only highlight on an exact path match (for section roots like /student). */
  exact?: boolean;
  /** A small count shown beside the label (e.g. open homework). */
  badge?: number | string;
};

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}

/** Underlined tab strip, like the tracker's section tabs. Scrolls sideways on narrow screens. */
export function TabNav({ items, label = "Sections" }: { items: NavItem[]; label?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto border-b border-border px-3 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {items.map((it) => {
          const active = isActive(path, it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block whitespace-nowrap px-4 pb-4 pt-3 text-[0.94rem] font-semibold transition-colors max-sm:px-2.5",
                  active ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {it.label}
                {it.badge !== undefined && it.badge !== 0 && <span className="ml-1 text-xs text-brand">{it.badge}</span>}
                {active && <span aria-hidden className="absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-[3px] bg-brand" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
