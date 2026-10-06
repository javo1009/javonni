"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ACCEPT_ATTR, ALLOWED_LABEL, formatBytes, MAX_FILE_BYTES } from "./file-rules";

/**
 * A drop target that is also a labelled file input: keyboard users tab to the (visually hidden) input
 * and press Enter/Space, everyone else can click or drag files onto it.
 */
export function DropZone({
  onFiles,
  disabled,
  title = "Drop files here or choose files",
  hint,
  className,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  title?: string;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center transition-colors",
        "hover:border-brand focus-within:border-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]",
        over && "border-brand bg-brand-soft",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input
        id={id}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand-soft text-lg text-brand">
        ↑
      </span>
      <span className="font-semibold text-ink">{title}</span>
      <span className="text-sm text-ink-2">{hint ?? `${ALLOWED_LABEL} · up to ${MAX_FILE_BYTES / 1024 / 1024} MB each`}</span>
    </label>
  );
}

export type UploadStatus = "queued" | "uploading" | "done" | "error";

const STATUS_TEXT: Record<UploadStatus, string> = { queued: "Ready", uploading: "Uploading…", done: "Uploaded", error: "Failed" };

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent motion-reduce:animate-none", className)} />;
}

/** One file in a list: name, size, an explicit status word (never colour alone) and an optional remove button. */
export function FileRow({
  name,
  size,
  status,
  error,
  href,
  onRemove,
  removeLabel = "Remove",
  extra,
}: {
  name: string;
  size: number;
  status?: UploadStatus;
  error?: string | null;
  href?: string;
  onRemove?: () => void;
  removeLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-xs font-bold uppercase text-ink-2">
          {name.includes(".") ? name.split(".").pop()!.slice(0, 4) : "file"}
        </span>
        <div className="min-w-0 flex-1">
          {href ? (
            <a href={href} className="block truncate font-medium text-link underline-offset-2 hover:underline" title={name}>
              {name}
            </a>
          ) : (
            <span className="block truncate font-medium text-ink" title={name}>
              {name}
            </span>
          )}
          <span className="text-xs text-ink-2">{formatBytes(size)}</span>
          {extra}
        </div>
        {status && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold",
              status === "done" && "text-good",
              status === "error" && "text-risk",
              (status === "queued" || status === "uploading") && "text-ink-2",
            )}
          >
            {status === "uploading" && <Spinner />}
            {status === "done" && <span aria-hidden>✓</span>}
            {status === "error" && <span aria-hidden>!</span>}
            {STATUS_TEXT[status]}
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${removeLabel} ${name}`}
            className="inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-sm font-semibold text-ink-2 hover:bg-surface-3 hover:text-risk max-sm:h-11"
          >
            {removeLabel}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 pl-12 text-sm text-risk">
          {error}
        </p>
      )}
    </li>
  );
}
