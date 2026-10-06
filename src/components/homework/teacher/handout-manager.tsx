"use client";

import { useRef, useState } from "react";
import { deleteHandout, uploadHandout } from "@/app/actions/teacher";
import { Button } from "@/components/ui";
import { plural } from "@/lib/format";
import { DropZone, FileRow, type UploadStatus } from "./file-drop";
import { downloadUrl, fileProblem, MAX_HANDOUTS } from "./file-rules";

type Existing = { id: string; name: string; size: number };
type Upload = {
  key: number;
  file: File;
  status: UploadStatus;
  error: string | null;
};

/**
 * Handout files for one homework. Anyone can add more at any time; removal only works on drafts,
 * because once assigned students may already be working from a file.
 */
export function HandoutManager({
  assignmentId,
  files,
  isDraft,
}: {
  assignmentId: string;
  files: Existing[];
  isDraft: boolean;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const seq = useRef(0);
  const busy = uploads.some(
    (u) => u.status === "uploading" || u.status === "queued",
  );
  const room = MAX_HANDOUTS - files.length - uploads.length;

  const patch = (key: number, p: Partial<Upload>) =>
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function addFiles(list: File[]) {
    const bad: string[] = [];
    const good: Upload[] = [];
    for (const f of list) {
      const problem = fileProblem(f);
      if (problem) bad.push(`${f.name}: ${problem}`);
      else if (good.length >= room)
        bad.push(
          `${f.name}: a homework can have at most ${MAX_HANDOUTS} files.`,
        );
      else
        good.push({
          key: ++seq.current,
          file: f,
          status: "queued",
          error: null,
        });
    }
    setRejected(bad);
    if (!good.length) return;
    setUploads((u) => [...u.filter((x) => x.status === "error"), ...good]);
    for (const [n, g] of good.entries()) {
      patch(g.key, { status: "uploading" });
      setStatus(`Uploading ${g.file.name} (${n + 1} of ${good.length})…`);
      try {
        const fd = new FormData();
        fd.set("assignmentId", assignmentId);
        fd.set("file", g.file);
        const r = await uploadHandout(fd);
        if (r.ok) {
          setUploads((u) => u.filter((x) => x.key !== g.key));
          setStatus(`${g.file.name} uploaded.`);
        } else {
          patch(g.key, { status: "error", error: r.error });
          setStatus(`${g.file.name} failed: ${r.error}`);
        }
      } catch {
        patch(g.key, {
          status: "error",
          error: "The upload failed. Check your connection and try again.",
        });
      }
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setRemoveError(null);
    const r = await deleteHandout(id);
    setRemoving(null);
    setConfirmId(null);
    if (!r.ok) setRemoveError(r.error);
    else setStatus("File removed.");
  }

  return (
    <div className="space-y-3">
      {files.length === 0 && uploads.length === 0 && (
        <p className="text-sm text-ink-2">
          No handout files. Students will only see your instructions.
        </p>
      )}
      {(files.length > 0 || uploads.length > 0) && (
        <ul className="space-y-2" aria-label="Handout files">
          {files.map((f) => (
            <FileRow
              key={f.id}
              name={f.name}
              size={f.size}
              href={downloadUrl(f.id)}
              onRemove={isDraft ? () => setConfirmId(f.id) : undefined}
              extra={
                confirmId === f.id ? (
                  <span
                    role="group"
                    aria-label={`Confirm removing ${f.name}`}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <span className="text-sm text-ink">
                      Remove this file from the draft?
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={removing === f.id}
                      onClick={() => remove(f.id)}
                    >
                      {removing === f.id ? "Removing…" : "Yes, remove"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(null)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : undefined
              }
            />
          ))}
          {uploads.map((u) => (
            <FileRow
              key={u.key}
              name={u.file.name}
              size={u.file.size}
              status={u.status}
              error={u.error}
              onRemove={
                u.status === "error"
                  ? () => setUploads((x) => x.filter((y) => y.key !== u.key))
                  : undefined
              }
              removeLabel="Dismiss"
            />
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
      {rejected.length > 0 && (
        <div
          role="alert"
          className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
        >
          <p className="font-semibold">Not added</p>
          <ul className="mt-1 list-disc pl-5">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {room > 0 ? (
        <DropZone
          onFiles={addFiles}
          disabled={busy}
          title="Add handout files"
          hint={`${plural(room, "more file")} allowed`}
          className="py-4"
        />
      ) : (
        <p className="text-sm text-ink-2">
          This homework has the maximum of {MAX_HANDOUTS} handout files.
        </p>
      )}
      <p className="text-sm text-ink-2">
        {isDraft
          ? "This is a draft, so you can still remove files. Students see nothing until you assign it."
          : "Students can already see these files, so they can't be removed. You can still add more."}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
