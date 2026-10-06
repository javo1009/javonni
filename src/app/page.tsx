import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ButtonLink, Eyebrow, ProgressBar } from "@/components/ui";
import { getCurrentUser, ROLE_HOME } from "@/server/dal";

const FEATURES = [
  { title: "Every module, one clear pace", body: "All 102 modules across the ten topics, scheduled against your exam date. See at a glance whether you are ahead of or behind plan." },
  { title: "Hours, mocks and practice", body: "Log study time, record mock scores and answer practice questions. Chapter scores and your weekly target stay in sync." },
  { title: "Review before you forget", body: "A spaced-review queue brings back chapters three days after you first read them, and again before the exam." },
  { title: "Homework your teacher can mark", body: "Teachers upload a worksheet; you download it, finish it and upload your work. They mark it and send feedback." },
];

const SAMPLE = [
  { name: "Quantitative Methods", pct: 0.82 },
  { name: "Financial Statement Analysis", pct: 0.54 },
  { name: "Economics", pct: 0.31 },
  { name: "Corporate Issuers", pct: 0.1 },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  return (
    <div className="mx-auto min-h-dvh max-w-[1480px] px-4 sm:px-9">
      <header className="flex min-h-[86px] items-center justify-between gap-4 border-b border-border">
        <Logo />
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </header>
      <main>
        <section className="grid gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div>
            <Eyebrow>CFA® PROGRAM LEVEL I · 2027</Eyebrow>
            <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.08] tracking-[-0.045em] text-ink">Stay on course for exam day.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              Track every Level I module, your study hours and mock exams against a plan. Teachers see how each student is pacing and send homework as files.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg">
                Join your class
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg">
                Sign in
              </ButtonLink>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow)]" aria-hidden>
            <div className="flex items-center justify-between">
              <p className="text-xl font-semibold tracking-tight text-ink">Your roadmap</p>
              <span className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-bold text-good">On track</span>
            </div>
            <div className="mt-6 space-y-5">
              {SAMPLE.map((t) => (
                <div key={t.name}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-ink">{t.name}</span>
                    <span className="tabular text-ink-3">{Math.round(t.pct * 100)}%</span>
                  </div>
                  <ProgressBar value={t.pct} label={t.name} />
                </div>
              ))}
            </div>
            <p className="mt-6 rounded-[9px] bg-surface-2 px-3.5 py-3 text-sm text-ink-2">On pace: 9.5 of 10 hours this week. Next up: Reading 12, Basics of Derivative Pricing.</p>
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-ink">{f.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-xs text-ink-3">
        CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute. Ascent is not affiliated with or endorsed by CFA Institute.
      </footer>
    </div>
  );
}
