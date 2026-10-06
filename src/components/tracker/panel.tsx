// Small layout pieces shared by every tracker panel. No hooks, so usable from server and client components.
import type { ReactNode } from "react";
import { Card, Eyebrow } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A dashboard panel: eyebrow + heading (+ optional right-hand action) over a body. */
export function Panel({
  id,
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card aria-labelledby={id} className={cn("p-5 max-sm:p-4 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
          <h2 id={id} className="text-[1.32rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Section heading between groups of panels. */
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 mt-10 max-w-3xl">
      {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
      <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{title}</h2>
      {children && <p className="mt-1.5 text-sm text-ink-2">{children}</p>}
    </div>
  );
}

/** Small inline note when a panel has nothing to show yet. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-ink-2", className)}>{children}</p>;
}

export function Note({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-[9px] px-3.5 py-2.5 text-sm",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "good" && "bg-good-soft text-good",
        tone === "warn" && "bg-warn-soft text-warn",
      )}
    >
      {children}
    </p>
  );
}
