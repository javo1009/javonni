// Skeleton shaped like the teacher pages (header, KPI strip, main panel) while data loads.
export default function TeacherLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="h-8 w-72 max-w-full rounded bg-surface-2" />
      </div>
      <div className="h-16 rounded-[var(--radius-card)] border border-border bg-surface" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-72 rounded-[var(--radius-card)] border border-border bg-surface" />
        <div className="h-72 rounded-[var(--radius-card)] border border-border bg-surface" />
      </div>
    </div>
  );
}
