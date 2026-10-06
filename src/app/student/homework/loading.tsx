export default function Loading() {
  return (
    <div className="space-y-4 pt-10" role="status" aria-label="Loading homework">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-[var(--radius-card)] bg-surface motion-reduce:animate-none" />
      ))}
    </div>
  );
}
