import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { Banner } from "@/components/ui";
import { BottomNav, SideNav, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path d="M3 20 L10 7 L14 13 L17 9 L21 20 Z" fill="var(--brand)" />
        <path d="M10 7 L12.2 10.6 L10.6 12 Z" fill="var(--surface)" opacity=".7" />
      </svg>
      Ascent
    </span>
  );
}

export function AppShell({
  nav,
  user,
  areaLabel,
  sampleCurriculum,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string };
  areaLabel: string;
  sampleCurriculum: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col lg:gap-6 lg:px-3 lg:py-5">
        <Link href="/" className="px-3">
          <Logo />
        </Link>
        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">{areaLabel}</p>
          <SideNav items={nav} />
        </div>
        <div className="mt-auto space-y-2 px-3 text-sm">
          <p className="truncate font-medium text-ink">{user.name}</p>
          <div className="flex items-center justify-between">
            <form action={logout}>
              <button className="text-ink-2 hover:text-ink hover:underline">Sign out</button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={logout}>
              <button className="rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">Sign out</button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {sampleCurriculum && (
            <div className="mb-6">
              <Banner title="Sample curriculum (demo data)">
                Topics, objectives and questions here are illustrative, not the official CFA Institute 2027 learning outcomes. An admin can
                import the official outline.
              </Banner>
            </div>
          )}
          {children}
        </main>
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
