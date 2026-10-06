"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { importCurriculumAction, previewImportAction, type ImportState, type PreviewState } from "@/app/actions/admin";
import { Banner, Field, FormError, Input, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ImportPreview } from "@/services/admin";
import { ImportPreviewView } from "./import-preview";

const MAX_BYTES = 900_000;

export function ImportPanel({ defaultYear }: { defaultYear: number }) {
  const [preview, previewAction] = useActionState<PreviewState, FormData>(previewImportAction, undefined);
  const [result, importAction] = useActionState<ImportState, FormData>(importCurriculumAction, undefined);
  // Controlled fields: React resets uncontrolled ones after each action.
  const [csv, setCsv] = useState("");
  const [previewed, setPreviewed] = useState<string | null>(null);
  const [importedFor, setImportedFor] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState(`CFA Level I ${defaultYear} (official outline)`);
  const [year, setYear] = useState(String(defaultYear));
  const [note, setNote] = useState("");
  const [activate, setActivate] = useState(false);
  const fileId = useId();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError(`That file is ${Math.round(f.size / 1000)} KB; the limit is ${MAX_BYTES / 1000} KB.`);
      return;
    }
    setFileName(f.name);
    setCsv(await f.text());
  }

  const p: ImportPreview | null = preview?.ok ? preview.preview : null;
  const fresh = p !== null && previewed === csv;
  const canImport = fresh && p.errors.length === 0 && p.stats.los > 0;
  // Once this exact CSV is imported, hide the button so it can't be imported twice by accident.
  const justImported = result?.ok === true && importedFor === csv;

  return (
    <form action={previewAction} className="space-y-5" aria-describedby="import-help">
      <p id="import-help" className="text-sm text-ink-2">
        One row per objective. Preview first: nothing is saved until you press Import. Importing creates a new version; it never edits an existing one.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-1.5">
          <label htmlFor="csv" className="block text-sm font-medium text-ink">
            CSV content
          </label>
          <Textarea
            id="csv"
            name="csv"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(null);
            }}
            spellCheck={false}
            placeholder="topic_code,topic_name,weight_min,weight_max,module_title,est_minutes,los_code,command_word,los_text,importance"
            className="min-h-48 font-mono text-xs"
            aria-describedby="csv-hint"
          />
          <p id="csv-hint" className="text-sm text-ink-2">
            Paste from a spreadsheet export, or choose a file.{" "}
            {csv && <span className="tabular">{csv.split(/\r\n|\n|\r/).filter((l) => l.trim()).length.toLocaleString()} non-empty lines.</span>}
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={fileId} className="block text-sm font-medium text-ink">
              Or upload a .csv file
            </label>
            <input
              id={fileId}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-2"
            />
            {fileName && <p className="text-sm text-ink-2">Loaded {fileName}</p>}
            {fileError && (
              <p role="alert" className="text-sm text-risk">
                {fileError}
              </p>
            )}
          </div>
          <a href="/admin/curriculum/template" download className={buttonClass("secondary", "sm")}>
            Download CSV template
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Checking…" onClick={() => setPreviewed(csv)}>
          Preview
        </SubmitButton>
        {preview && !preview.ok && <FormError message={preview.error} />}
      </div>

      <div aria-live="polite">
        {p && (
          <div className="space-y-5">
            {!fresh && (
              <Banner tone="neutral" title="The CSV changed since this preview">
                Preview again before importing.
              </Banner>
            )}
            <ImportPreviewView preview={p} />
          </div>
        )}
      </div>

      {p && fresh && p.errors.length === 0 && !justImported && (
        <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Import as a new version</legend>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field label="Version name" htmlFor="name">
              <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} />
            </Field>
            <Field label="Year" htmlFor="year">
              <Input id="year" name="year" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" required />
            </Field>
          </div>
          <Field label="Source note (optional)" htmlFor="sourceNote" hint="Where this came from, e.g. the PDF name and date you downloaded it.">
            <Input id="sourceNote" name="sourceNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          <div className="flex items-start gap-2">
            <input
              id="activate"
              name="activate"
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
              className="mt-1 size-4 accent-[var(--brand)]"
              aria-describedby="activate-hint"
            />
            <div>
              <label htmlFor="activate" className="text-sm font-medium text-ink">
                Make this the active version
              </label>
              <p id="activate-hint" className="text-sm text-ink-2">
                New study plans use the active version. Existing student plans keep the version they were built from.
              </p>
            </div>
          </div>
          <SubmitButton formAction={importAction} disabled={!canImport} pendingLabel="Importing…" onClick={() => setImportedFor(csv)}>
            Import {p.stats.los.toLocaleString()} objectives
          </SubmitButton>
        </fieldset>
      )}

      <div aria-live="polite">
        {result?.ok === false && <FormError message={result.error} />}
        {result?.ok && (
          <Banner tone="good" title="Import complete">
            {result.message}{" "}
            <Link href="/admin/coverage" className="font-medium underline">
              Check coverage
            </Link>
          </Banner>
        )}
      </div>
    </form>
  );
}
