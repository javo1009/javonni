import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function AuthLayout({ title, subtitle, children, aside }: { title: string; subtitle: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">{title}</h1>
          <p className="mt-2 mb-8 text-ink-2">{subtitle}</p>
          {children}
          {aside}
        </main>
      </div>
      <div className="relative hidden overflow-hidden lg:block" aria-hidden>
        <AuthArt />
      </div>
    </div>
  );
}

/** Decorative: the study roadmap as ten topic bars filling at different rates. */
function AuthArt() {
  const topics = [78, 64, 52, 40, 31, 22, 14, 8, 4, 0];
  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-[#12304a] to-[#08111d] p-12 text-white">
      <div className="mt-10 space-y-3.5 opacity-90">
        {topics.map((v, i) => (
          <div key={i} className="h-3 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#2ba9cf] to-[#69e5dc]" style={{ width: `${v}%` }} />
          </div>
        ))}
      </div>
      <div className="max-w-md">
        <p className="text-3xl font-bold leading-snug tracking-tight">All 102 modules. One clear pace.</p>
        <p className="mt-3 text-white/75">Know whether you&apos;re ahead or behind your study plan, what to read next, and when to review. Your teacher sees where the class needs help.</p>
      </div>
    </div>
  );
}
