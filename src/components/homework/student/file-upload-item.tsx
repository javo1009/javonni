"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  LoaderCircle,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import {
  uploadSubmissionFile,
  deleteSubmissionFile,
} from "@/app/actions/student";
import { Button, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  ACCEPT_ATTR,
  ALLOWED_TYPES_TEXT,
  FILE_RULES,
  formatBytes,
  maxSizeText,
  typeLabelOf,
  validateClientFile,
} from "./file-rules";
import { FileTypeIcon, fileHref } from "./file-links";

export type UploadedFile = { id: string; name: string; size: number };

type QueueEntry = {
  key: string;
  file: File;
  status: "waiting" | "uploading" | "error";
  error?: string;
};

let seq = 0;
const nextKey = () => `u${++seq}`;

/**
 * One "upload your work" item: drag-and-drop zone plus a real file input behind a button,
 * files uploaded one at a time with their own pending/error state, and the list of what's already uploaded.
 */
export function FileUploadItem({
  assignmentId,
  itemId,
  label,
  files,
  disabled,
  disabledReason,
  onAdded,
  onRemoved,
  onBusyChange,
}: {
  assignmentId: string;
  itemId: string;
  label: string;
  files: UploadedFile[];
  disabled: boolean;
  disabledReason?: string;
  onAdded: (f: UploadedFile) => void;
  onRemoved: (id: string) => void;
  onBusyChange: (itemId: string, busy: boolean) => void;
}) {
  const inputId = useId();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [removeError, setRemoveError] = useState<string | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const dragDepth = useRef(0);
  // Latest counts for the "at most N files" check when several files arrive in one drop.
  const heldRef = useRef(0);
  const busyRef = useRef(false);

  const active = queue.filter((q) => q.status !== "error").length;
  useEffect(() => {
    heldRef.current = files.length + active;
  }, [files.length, active]);
  useEffect(() => {
    const busy = active > 0;
    if (busy !== busyRef.current) {
      busyRef.current = busy;
      onBusyChange(itemId, busy);
    }
  }, [active, itemId, onBusyChange]);
  useEffect(
    () => () => {
      if (busyRef.current) onBusyChange(itemId, false);
    },
    [itemId, onBusyChange],
  );

  const patch = (key: string, p: Partial<QueueEntry>) =>
    setQueue((q) => q.map((e) => (e.key === key ? { ...e, ...p } : e)));

  async function upload(entry: QueueEntry) {
    patch(entry.key, { status: "uploading", error: undefined });
    const fd = new FormData();
    fd.set("assignmentId", assignmentId);
    fd.set("itemId", itemId);
    fd.set("file", entry.file);
    let res: Awaited<ReturnType<typeof uploadSubmissionFile>>;
    try {
      res = await uploadSubmissionFile(fd);
    } catch {
      res = {
        ok: false,
        error: "Couldn't upload. Check your connection and try again.",
      };
    }
    if (res.ok) {
      onAdded({ id: res.data.id, name: res.data.name, size: res.data.size });
      setQueue((q) => q.filter((e) => e.key !== entry.key));
      setAnnounce(`Uploaded ${res.data.name}.`);
    } else {
      patch(entry.key, { status: "error", error: res.error });
      setAnnounce(`Couldn't upload ${entry.file.name}. ${res.error}`);
    }
  }

  function enqueue(entry: QueueEntry) {
    chain.current = chain.current.then(() => upload(entry));
  }

  function addFiles(list: File[]) {
    if (disabled || list.length === 0) return;
    let held = heldRef.current;
    const entries: QueueEntry[] = [];
    for (const file of list) {
      const error = validateClientFile(file, held);
      if (error) entries.push({ key: nextKey(), file, status: "error", error });
      else {
        held++;
        entries.push({ key: nextKey(), file, status: "waiting" });
      }
    }
    heldRef.current = held;
    setQueue((q) => [...q, ...entries]);
    setAnnounce(
      entries.some((e) => e.status === "waiting")
        ? `Uploading ${entries.filter((e) => e.status === "waiting").length} ${entries.filter((e) => e.status === "waiting").length === 1 ? "file" : "files"}.`
        : "",
    );
    for (const e of entries) if (e.status === "waiting") enqueue(e);
  }

  async function remove(f: UploadedFile) {
    setRemoveError(null);
    setRemoving((s) => new Set(s).add(f.id));
    let res: Awaited<ReturnType<typeof deleteSubmissionFile>>;
    try {
      res = await deleteSubmissionFile(f.id);
    } catch {
      res = { ok: false, error: "Couldn't remove that file. Try again." };
    }
    setRemoving((s) => {
      const n = new Set(s);
      n.delete(f.id);
      return n;
    });
    if (res.ok) {
      onRemoved(f.id);
      setAnnounce(`Removed ${f.name}.`);
    } else setRemoveError(res.error);
  }

  const full = files.length + active >= FILE_RULES.perItem;

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => {
          if (disabled) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!disabled) e.preventDefault();
        }}
        onDragLeave={() => {
          if (disabled) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        data-testid="dropzone"
        className={cn(
          "relative flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          disabled
            ? "border-border bg-surface-2"
            : dragging
              ? "border-brand bg-brand-soft"
              : "border-border-strong bg-surface-2/60",
        )}
      >
        <Upload
          aria-hidden
          className={cn("size-7", dragging ? "text-brand" : "text-ink-2")}
        />
        <div>
          <p className="font-medium text-ink">
            {disabled
              ? (disabledReason ?? "Uploads are closed")
              : dragging
                ? "Drop to upload"
                : "Drag your completed files here"}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">
            {ALLOWED_TYPES_TEXT}. Up to {maxSizeText()} each,{" "}
            {FILE_RULES.perItem} files at most.
          </p>
        </div>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          disabled={disabled || full}
          className="peer sr-only"
          aria-label={`Choose files to upload for: ${label}`}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            buttonClass(
              "secondary",
              "md",
              "cursor-pointer max-sm:min-w-44 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]",
            ),
            (disabled || full) && "pointer-events-none opacity-50",
          )}
        >
          <Upload aria-hidden className="size-4" />
          {full ? "File limit reached" : "Choose files"}
        </label>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {(files.length > 0 || queue.length > 0) && (
        <ul aria-label="Your uploaded files" className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2"
            >
              <FileTypeIcon name={f.name} />
              <div className="min-w-0 flex-1">
                <a
                  href={fileHref(f.id)}
                  className="block truncate font-medium text-ink hover:underline"
                  title={`Download ${f.name}`}
                >
                  {f.name}
                </a>
                <p className="text-xs text-ink-2">
                  {typeLabelOf(f.name)} · {formatBytes(f.size)} · uploaded
                </p>
              </div>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removing.has(f.id)}
                  onClick={() => remove(f)}
                  aria-label={`Remove ${f.name}`}
                  className="max-sm:min-w-11"
                >
                  {removing.has(f.id) ? (
                    <LoaderCircle
                      aria-hidden
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Trash2 aria-hidden className="size-4" />
                  )}
                  <span className="max-sm:sr-only">
                    {removing.has(f.id) ? "Removing…" : "Remove"}
                  </span>
                </Button>
              )}
            </li>
          ))}
          {queue.map((q) => (
            <li
              key={q.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2",
                q.status === "error"
                  ? "border-risk/50 bg-risk-soft"
                  : "border-border bg-surface-2",
              )}
            >
              <FileTypeIcon name={q.file.name} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-medium text-ink"
                  title={q.file.name}
                >
                  {q.file.name}
                </p>
                {q.status === "error" ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-sm text-risk"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>{q.error}</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-ink-2">
                    <LoaderCircle
                      aria-hidden
                      className={cn(
                        "size-3.5",
                        q.status === "uploading" &&
                          "animate-spin motion-reduce:animate-none",
                      )}
                    />
                    {q.status === "uploading"
                      ? "Uploading…"
                      : "Waiting to upload…"}{" "}
                    · {formatBytes(q.file.size)}
                  </p>
                )}
              </div>
              {q.status === "error" && (
                <div className="flex shrink-0 gap-1">
                  {!validateClientFile(q.file, 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => enqueue(q)}
                      aria-label={`Retry uploading ${q.file.name}`}
                    >
                      <RotateCcw aria-hidden className="size-4" />
                      <span className="max-sm:sr-only">Retry</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQueue((all) => all.filter((e) => e.key !== q.key))
                    }
                    aria-label={`Dismiss message about ${q.file.name}`}
                  >
                    <X aria-hidden className="size-4" />
                    <span className="max-sm:sr-only">Dismiss</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {removeError && (
        <p
          role="alert"
          className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
        >
          {removeError}
        </p>
      )}
    </div>
  );
}
