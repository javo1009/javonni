"use client";

import { useRef, useState } from "react";
import { deleteFeedbackFile, uploadFeedbackFile } from "@/app/actions/teacher";
import { DropZone, FileRow, type UploadStatus } from "./file-drop";
import { downloadUrl, fileProblem, MAX_FEEDBACK_FILES } from "./file-rules";

type Existing = { id: string; name: string; size: number };
type Upload = { key: number; file: File; status: UploadStatus; error: string | null };

/** Marked-up copies returned with the grade. Changes apply immediately (no need to press "Return"). */
export function FeedbackFiles({ submissionId, files, graded }: { submissionId: string; files: Existing[]; graded: boolean }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const seq = useRef(0);
  const busy = uploads.some((u) => u.status === "uploading" || u.status === "queued");
  const room = MAX_FEEDBACK_FILES - files.length - uploads.length;
  const patch = (key: number, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function addFiles(list: File[]) {
    const bad: string[] = [];
    const good: Upload[] = [];
    for (const f of list) {
      const problem = fileProblem(f);
      if (problem) bad.push(`${f.name}: ${problem}`);
      else if (good.length >= room) bad.push(`${f.name}: at most ${MAX_FEEDBACK_FILES} feedback files per submission.`);
      else good.push({ key: ++seq.current, file: f, status: "queued", error: null });
    }
    setRejected(bad);
    if (!good.length) return;
    setUploads((u) => [...u.filter((x) => x.status === "error"), ...good]);
    for (const g of good) {
      patch(g.key, { status: "uploading" });
      setStatus(`Uploading ${g.file.name}…`);
      try {
        const fd = new FormData();
        fd.set("submissionId", submissionId);
        fd.set("file", g.file);
        const r = await uploadFeedbackFile(fd);
        if (r.ok) {
          setUploads((u) => u.filter((x) => x.key !== g.key));
          setStatus(`${g.file.name} uploaded.`);
        } else {
          patch(g.key, { status: "error", error: r.error });
          setStatus(`${g.file.name} failed: ${r.error}`);
        }
      } catch {
        patch(g.key, { status: "error", error: "The upload failed. Check your connection and try again." });
      }
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setError(null);
    const r = await deleteFeedbackFile(id);
    setRemoving(null);
    if (!r.ok) setError(r.error);
    else setStatus("File removed.");
  }

  return (
    <div className="space-y-3">
      {(files.length > 0 || uploads.length > 0) && (
        <ul className="space-y-2" aria-label="Feedback files">
          {files.map((f) => (
            <FileRow key={f.id} name={f.name} size={f.size} href={downloadUrl(f.id)} onRemove={removing === f.id ? undefined : () => void remove(f.id)} />
          ))}
          {uploads.map((u) => (
            <FileRow
              key={u.key}
              name={u.file.name}
              size={u.file.size}
              status={u.status}
              error={u.error}
              removeLabel="Dismiss"
              onRemove={u.status === "error" ? () => setUploads((x) => x.filter((y) => y.key !== u.key)) : undefined}
            />
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
          {error}
        </p>
      )}
      {rejected.length > 0 && (
        <div role="alert" className="rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk">
          <ul className="list-disc pl-5">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {room > 0 ? (
        <DropZone onFiles={addFiles} disabled={busy} title="Add marked-up file" hint={`Up to ${room} more`} className="py-3.5" />
      ) : (
        <p className="text-sm text-ink-2">Maximum of {MAX_FEEDBACK_FILES} feedback files reached.</p>
      )}
      <p className="text-sm text-ink-2">{graded ? "The student can see these files now." : "The student sees these once you return the graded work."}</p>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
