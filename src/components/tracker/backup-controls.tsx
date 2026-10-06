"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { exportBackupAction, importBackupAction } from "@/app/actions/student";
import { Button } from "@/components/ui";
import { StatusMessage, useNotice } from "./messages";

const MAX_BYTES = 1_000_000;

type Pending = { name: string; text: string };

/**
 * Export / import of the progress backup (same JSON format as the original dashboard).
 * Import asks for confirmation first because it replaces everything.
 */
export function BackupControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [notice, notify] = useNotice();
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Pending | null>(null);

  function exportBackup() {
    setError(null);
    notify(null);
    startTransition(async () => {
      const r = await exportBackupAction();
      if (!r.ok) return setError(r.error);
      const url = URL.createObjectURL(
        new Blob([r.data.json], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.data.filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Backup downloaded as ${r.data.filename}.`);
    });
  }

  async function chooseFile(file: File | undefined) {
    setError(null);
    notify(null);
    setStaged(null);
    if (!file) return;
    if (file.size > MAX_BYTES)
      return setError("That backup file is too large (the limit is 1 MB).");
    const text = await file.text();
    try {
      JSON.parse(text);
    } catch {
      return setError(
        "That file isn't valid JSON. Choose a backup you exported from the tracker.",
      );
    }
    setStaged({ name: file.name, text });
  }

  function confirmImport() {
    if (!staged) return;
    const { text } = staged;
    setStaged(null);
    startTransition(async () => {
      const r = await importBackupAction(text);
      if (!r.ok) return setError(r.error);
      const sk = r.data.skipped as {
        modules?: number;
        sessions?: number;
        mocks?: number;
      } | null;
      const skipped =
        (sk?.modules ?? 0) + (sk?.sessions ?? 0) + (sk?.mocks ?? 0);
      notify(
        `Backup imported: ${r.data.chapters} chapters, ${r.data.sessions} study sessions, ${r.data.mocks} mock results.` +
          (skipped
            ? ` Skipped ${skipped} entries that didn't match (${sk?.modules ?? 0} chapters, ${sk?.sessions ?? 0} sessions, ${sk?.mocks ?? 0} mocks).`
            : ""),
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-2 max-sm:items-stretch">
      <div className="flex flex-wrap items-center justify-end gap-2.5 max-sm:justify-start">
        <span className="mr-1 text-[0.82rem] text-ink-3">
          Progress is saved to your account
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={exportBackup}
          disabled={pending}
        >
          <Download aria-hidden className="size-4" />
          Export backup
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
        >
          <Upload aria-hidden className="size-4" />
          Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a backup file to import"
          data-testid="backup-file"
          onChange={(e) => {
            void chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {staged && (
        <div
          role="alertdialog"
          aria-labelledby="import-confirm-title"
          aria-describedby="import-confirm-text"
          className="w-full max-w-xl rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm text-warn"
        >
          <p id="import-confirm-title" className="font-semibold">
            This replaces your progress
          </p>
          <p id="import-confirm-text" className="mt-1 text-ink-2">
            Importing <strong className="text-ink">{staged.name}</strong>{" "}
            replaces your chapter progress, study sessions and mock results with
            what is in the file. Exam date and weekly hours are updated if the
            file has valid ones. This can&apos;t be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={confirmImport}>
              Replace my progress
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStaged(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-xl rounded-lg bg-risk-soft px-3 py-2 text-sm text-risk"
        >
          {error}
        </p>
      )}
      {pending && <p className="text-sm text-ink-2">Working…</p>}
      <StatusMessage
        notice={notice}
        className="max-w-xl text-right max-sm:text-left"
      />
    </div>
  );
}
