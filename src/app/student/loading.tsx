// Shown while a student page streams in (Homework and Practice have their own where it matters).
const bar = "animate-pulse rounded-lg bg-surface-3 motion-reduce:animate-none";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pb-12">
      <span className="sr-only">Loading…</span>
      <div className="pb-6 pt-8">
        <div className={`${bar} mb-3 h-3 w-24`} />
        <div className={`${bar} h-10 w-80 max-w-full`} />
        <div className={`${bar} mt-3 h-4 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[9.5rem] rounded-[var(--radius-card)] border border-border bg-surface p-5 max-sm:h-32 max-sm:p-4">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-4 h-9 w-20`} />
            <div className={`${bar} mt-5 h-2 w-full`} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        {[56, 56].map((h, i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-border bg-surface p-6" style={{ height: `${h * 0.25}rem` }}>
            <div className={`${bar} h-5 w-36`} />
            <div className={`${bar} mt-6 h-8 w-40`} />
            <div className={`${bar} mt-5 h-5 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}
