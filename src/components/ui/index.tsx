// Server-safe UI primitives (no hooks). Tokens come from globals.css.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";
const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-ink border border-border-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-risk text-white hover:brightness-110",
};
const buttonSize: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariant[variant], buttonSize[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle, id }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
      <div className="min-w-0">
        <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

type Tone = "neutral" | "brand" | "warn" | "risk" | "good";
const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  risk: "bg-risk-soft text-risk border-transparent",
  good: "bg-good-soft text-good border-transparent",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", toneClass[tone], className)}
      {...props}
    />
  );
}

/** A status dot + label; state is never colour-only. */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const dot: Record<Tone, string> = {
    neutral: "bg-ink-3",
    brand: "bg-brand",
    warn: "bg-warn",
    risk: "bg-risk",
    good: "bg-good",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
      <span aria-hidden className={cn("size-2 rounded-full", dot[tone])} />
      {label}
    </span>
  );
}

export function PageHeader({ title, eyebrow, description, actions }: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-ink-2">{eyebrow}</p>}
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold text-ink", tone === "risk" && "text-risk", tone === "warn" && "text-warn")}>{value}</p>
      {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, max = 1, label, className }: { value: number; max?: number; label: string; className?: string }) {
  const pctValue = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pctValue * 100)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pctValue * 100}%` }} />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = "warn", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div role="note" className={cn("rounded-lg border px-4 py-3 text-sm", toneClass[tone])}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-0.5 opacity-90">{children}</div>}
    </div>
  );
}

const fieldInput =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3 focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldInput, "h-10", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldInput, "min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldInput, "h-10", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
}) {
  const errId = `${htmlFor}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-sm text-ink-2">{hint}</p>}
      {errors?.length ? (
        <p id={errId} className="text-sm text-risk" role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
      {message}
    </p>
  );
}

/** Accessible table container: scrolls inside its region, never the page. */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
      {children}
    </div>
  );
}

export const th = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2 whitespace-nowrap";
export const td = "px-4 py-3 text-sm text-ink align-middle";
