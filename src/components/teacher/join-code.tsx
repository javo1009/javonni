import { headers } from "next/headers";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

/** Absolute origin of the current request, for shareable links. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Class join code and the self-registration link, each with a copy button. */
export async function JoinCode({ code, compact, className }: { code: string; compact?: boolean; className?: string }) {
  const link = `${await requestOrigin()}/register?code=${encodeURIComponent(code)}`;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Join code</span>
        <code className="rounded-md bg-surface-2 px-2 py-1 font-mono text-base font-semibold tracking-[0.2em] text-ink">{code}</code>
        <CopyButton value={code} label={`Copy join code ${code}`} />
      </div>
      {!compact && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Sign-up link</span>
          <code className="min-w-0 truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-sm text-ink" title={link}>
            {link.replace(/^https?:\/\//, "")}
          </code>
          <CopyButton value={link} label="Copy sign-up link" />
        </div>
      )}
    </div>
  );
}
