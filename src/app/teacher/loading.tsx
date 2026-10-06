// Shown while any teacher page streams in (class sections with their own loading.tsx override it).
const bar = "animate-pulse rounded-lg bg-surface-3 motion-reduce:animate-none";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pb-12">
      <span className="sr-only">Loading…</span>
      <div className="pb-6 pt-8">
        <div className={`${bar} mb-3 h-3 w-20`} />
        <div className={`${bar} h-10 w-72 max-w-full`} />
        <div className={`${bar} mt-3 h-4 w-80 max-w-full`} />
      </div>
      <div className="grid grid-cols-1 gap-3.5 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-[9.5rem] rounded-[var(--radius-card)] border border-border bg-surface p-5 max-sm:h-28"
          >
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-4 h-9 w-20`} />
            <div className={`${bar} mt-5 h-2 w-full`} />
          </div>
        ))}
      </div>
      <div className="mt-6 h-56 rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <div className={`${bar} h-5 w-40`} />
        <div className={`${bar} mt-5 h-20 w-full`} />
      </div>
      <div className="mt-6 h-72 rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <div className={`${bar} h-5 w-32`} />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${bar} h-8 w-full`} />
          ))}
        </div>
      </div>
    </div>
  );
}
