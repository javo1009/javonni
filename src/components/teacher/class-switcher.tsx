import Link from "next/link";
import { cn } from "@/lib/cn";

/** Pill links between a teacher's classes; the choice lives in `?class=<id>` so it survives reloads and can be shared. */
export function ClassSwitcher({
  classes,
  activeId,
}: {
  classes: { id: string; name: string; students: number }[];
  activeId: string;
}) {
  if (classes.length < 2) return null;
  return (
    <nav aria-label="Choose a class" className="-mt-2 mb-5">
      <ul className="flex flex-wrap gap-2">
        {classes.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <Link
                href={`/teacher?class=${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition max-sm:min-h-11",
                  active
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border-strong bg-surface-2 text-ink-2 hover:text-ink",
                )}
              >
                {c.name}
                <span className="tabular text-xs font-medium opacity-80">
                  {c.students}
                </span>
                <span className="sr-only">
                  {c.students === 1 ? "student" : "students"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
