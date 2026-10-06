import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { TabNav, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-[10px] bg-gradient-to-br from-[#51e2df] to-[#2a78bc] text-[1.6rem] font-extrabold leading-none text-[#06111c] shadow-[0_6px_20px_#22b9d534]"
      >
        A
      </span>
      <span className="leading-tight">
        <strong className="block text-[1.05rem] font-bold tracking-[0.01em] text-ink">Ascent</strong>
        <small className="block text-[0.82rem] text-ink-3">{subtitle ?? "CFA® Level I study tracker"}</small>
      </span>
    </span>
  );
}

/**
 * Signed-in frame: top bar (brand, who you are, theme, sign out), then page content.
 * Pages render their own heading and, where they have sections, a <TabNav>.
 */
export function AppShell({
  user,
  areaLabel,
  actions,
  children,
}: {
  user: { name: string; role: string };
  areaLabel: string;
  /** Extra controls in the top bar, before the account controls (e.g. a class switcher). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-dvh max-w-[1480px] px-4 sm:px-9">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="flex min-h-[86px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border py-3">
        <Link href="/" aria-label="Ascent home">
          <Logo subtitle={areaLabel} />
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          {actions}
          <span className="max-w-48 truncate text-sm text-ink-2" title={user.name}>
            {user.name}
          </span>
          <ThemeToggle />
          <form action={logout}>
            <button className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm font-semibold text-ink hover:bg-surface-3 max-sm:h-11">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-9 border-t border-border pb-10 pt-5 text-xs text-ink-3">
        Ascent is an independent study tool and is not affiliated with CFA Institute. CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute.
      </footer>
    </div>
  );
}

export { TabNav, type NavItem };
