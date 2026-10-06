// Skeleton shaped like a typical student page: header, a list, a side column.
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
        <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
          <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
