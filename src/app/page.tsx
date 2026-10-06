import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { Logo } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { MasteryLegend } from "@/components/viz/mastery";
import { getCurrentUser, ROLE_HOME } from "@/server/dal";

const FEATURES = [
  { title: "A plan that adapts", body: "Set your exam date and weekly hours. Ascent schedules every module, spaced review and full mocks, and offers ways to catch up when you slip." },
  { title: "Every objective tracked", body: "Each learning objective moves from not started to proficient, with review prompts before it fades." },
  { title: "Practice that targets weak spots", body: "Questions pick what you most need: overdue reviews, untouched objectives and recent mistakes." },
  { title: "Teachers see where to help", body: "A cockpit that leads with who needs attention, a class heatmap and homework that grades itself." },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-8">
        <section className="grid gap-10 py-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-medium text-brand">CFA® Program Level I · 2027 curriculum</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Know exactly what to study today, and whether you&apos;re on track.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              Ascent turns the Level I curriculum into a personal plan, tracks every learning objective, and gives your teacher a clear view of
              where the class needs help.
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
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">Your curriculum map</p>
            <div className="mt-4 grid grid-cols-12 gap-1" aria-hidden>
              {Array.from({ length: 96 }, (_, i) => {
                const v = (i * 37) % 11;
                const cls = v < 3 ? "hatch" : v < 5 ? "bg-m-1" : v < 7 ? "bg-m-2" : v < 9 ? "bg-m-3" : "bg-m-4";
                return <span key={i} className={`aspect-square rounded-[3px] ring-1 ring-inset ring-border-strong/60 ${cls}`} />;
              })}
            </div>
            <MasteryLegend className="mt-4" />
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-ink">{f.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-ink-3">
        CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute. Ascent is not affiliated with or endorsed by CFA Institute.
      </footer>
    </div>
  );
}
