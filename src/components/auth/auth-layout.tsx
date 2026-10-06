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
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-ink">{title}</h1>
          <p className="mt-2 mb-8 text-ink-2">{subtitle}</p>
          {children}
          {aside}
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-[var(--m-4)] lg:block" aria-hidden>
        <AuthArt />
      </div>
    </div>
  );
}

/** Decorative: a curriculum map filling in, cell by cell. */
function AuthArt() {
  const cols = 14;
  const rows = 18;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const v = (Math.sin(x * 1.7 + y * 0.9) + Math.cos(y * 1.3 - x * 0.4) + 2) / 4 - y / rows / 2.2;
    return { x, y, level: v > 0.55 ? 4 : v > 0.4 ? 3 : v > 0.28 ? 2 : v > 0.15 ? 1 : 0 };
  });
  const fills = ["rgb(255 255 255 / 0.05)", "var(--m-1)", "var(--m-2)", "var(--m-3)", "rgb(255 255 255 / 0.85)"];
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
      <svg viewBox={`0 0 ${cols * 22} ${rows * 22}`} className="absolute inset-0 h-full w-full opacity-70" preserveAspectRatio="xMidYMid slice">
        {cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x * 22 + 3} y={c.y * 22 + 3} width={16} height={16} rx={3} fill={fills[c.level]} />
        ))}
      </svg>
      <div className="relative" />
      <div className="relative max-w-md">
        <p className="font-[family-name:var(--font-display)] text-3xl leading-snug">Every learning objective, tracked until it sticks.</p>
        <p className="mt-3 text-white/80">A plan that adapts when life happens, practice that targets what you&apos;re weakest at, and a teacher who can see where to help.</p>
      </div>
    </div>
  );
}
