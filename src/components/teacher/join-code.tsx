import { CopyButton } from "./copy-button";

/** The class join code as a chip with a copy button. */
export function JoinCodeChip({ code }: { code: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[10px] border border-border-strong bg-surface-2 py-1 pl-3 pr-1">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
        Join code
      </span>
      <span
        className="font-mono text-base font-bold tracking-[0.18em] text-ink"
        aria-label={`Join code ${code.split("").join(" ")}`}
      >
        {code}
      </span>
      <CopyButton
        text={code}
        aria-label="Copy join code"
        className="max-sm:h-9"
      >
        Copy
      </CopyButton>
    </div>
  );
}
