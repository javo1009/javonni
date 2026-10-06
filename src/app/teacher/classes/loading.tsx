const bar = "animate-pulse rounded-lg bg-surface-3 motion-reduce:animate-none";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pb-12">
      <span className="sr-only">Loading…</span>
      <div className="pb-6 pt-8">
        <div className={`${bar} mb-3 h-3 w-20`} />
        <div className={`${bar} h-10 w-56 max-w-full`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="h-52 rounded-[var(--radius-card)] border border-border bg-surface p-5"
          >
            <div className={`${bar} h-6 w-48`} />
            <div className={`${bar} mt-3 h-4 w-64 max-w-full`} />
            <div className={`${bar} mt-6 h-9 w-56`} />
          </div>
        ))}
      </div>
    </div>
  );
}
