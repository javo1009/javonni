export default function Loading() {
  return (
    <div
      className="space-y-4 pt-10"
      role="status"
      aria-label="Loading practice"
    >
      <div className="h-10 w-72 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-surface motion-reduce:animate-none" />
    </div>
  );
}
