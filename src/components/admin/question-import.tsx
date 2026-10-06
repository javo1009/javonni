"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import {
  importQuestionsAction,
  previewQuestionImportAction,
} from "@/app/actions/admin";
import {
  Badge,
  Banner,
  Button,
  FormError,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { QUESTION_CSV } from "@/domain/question-csv";
import type {
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
} from "@/services/admin";

const SHOW = 100;
const DIFFICULTY = ["", "Easy", "Medium", "Hard"];
const kb = (n: number) =>
  `${Math.max(1, Math.round(n / 1000)).toLocaleString()} KB`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

type Loaded = { name: string; size: number; text: string };

export function QuestionImport() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [preview, setPreview] = useState<{
    csv: string;
    data: ImportPreview;
  } | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<
    (ImportResult & { fileName: string }) | null
  >(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(null);
    setPreview(null);
    setError(undefined);
    setFileError(undefined);
    setResult(null);
    setSkipInvalid(false);
    if (!f) return;
    if (!/\.csv$/i.test(f.name))
      return setFileError(
        "Choose a .csv file. In Excel or Sheets use File → Save as / Download → CSV (UTF-8).",
      );
    if (f.size > QUESTION_CSV.maxBytes)
      return setFileError(
        `That file is ${kb(f.size)}; the limit is ${kb(QUESTION_CSV.maxBytes)}. Split it into smaller files.`,
      );
    if (f.size === 0) return setFileError("That file is empty.");
    try {
      setFile({ name: f.name, size: f.size, text: await f.text() });
    } catch {
      setFileError(
        "Couldn't read that file. Try saving it again as CSV (UTF-8).",
      );
    }
  }

  function runPreview() {
    if (!file) return;
    setError(undefined);
    setResult(null);
    setBusy("preview");
    const csv = file.text;
    start(async () => {
      const r = await previewQuestionImportAction({ csv });
      setBusy(null);
      if (!r.ok) {
        setPreview(null);
        return setError(r.error);
      }
      setSkipInvalid(false);
      setPreview({ csv, data: r.data });
    });
  }

  function runImport() {
    if (!preview || !file) return;
    setError(undefined);
    setBusy("import");
    const name = file.name;
    start(async () => {
      const r = await importQuestionsAction({ csv: preview.csv, skipInvalid });
      setBusy(null);
      if (!r.ok) return setError(r.error);
      setResult({ ...r.data, fileName: name });
      setPreview(null);
      setFile(null);
      setSkipInvalid(false);
      setInputKey((k) => k + 1); // clear the file input
    });
  }

  const p = preview?.data;
  const fresh = !!p && !!file && preview.csv === file.text;
  const hasFileErrors = !!p && p.fileErrors.length > 0;
  const invalid = p?.counts.errors ?? 0;
  const ready = p?.counts.ok ?? 0;
  const canImport =
    fresh &&
    !hasFileErrors &&
    ready > 0 &&
    (invalid === 0 || skipInvalid) &&
    !pending;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ink"
          >
            Question CSV file
          </label>
          <input
            key={inputKey}
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            aria-describedby={`${inputId}-hint`}
            className="block w-full rounded-[9px] border border-border-strong bg-surface-2 p-2 text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-3"
          />
          <p id={`${inputId}-hint`} className="text-sm text-ink-2">
            {file ? (
              <>
                <span className="font-medium text-ink">{file.name}</span> ·{" "}
                {kb(file.size)} loaded.
              </>
            ) : (
              <>
                Up to {QUESTION_CSV.maxRows} questions and{" "}
                {kb(QUESTION_CSV.maxBytes)} per file. Nothing is saved until you
                confirm.
              </>
            )}
          </p>
          {fileError && (
            <p role="alert" className="text-sm text-risk">
              {fileError}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={runPreview}
          disabled={!file || pending}
          aria-busy={busy === "preview"}
        >
          {busy === "preview" ? "Checking…" : "Preview import"}
        </Button>
      </div>

      <div aria-live="polite" className="space-y-5">
        {error && <FormError message={error} />}

        {result && (
          <Banner
            tone="good"
            title={`Imported ${plural(result.imported, "question")} from ${result.fileName}`}
          >
            Students can practise them right away.
            {result.skippedInvalid > 0 &&
              ` Skipped ${plural(result.skippedInvalid, "invalid row")}.`}
            {result.skippedDuplicates > 0 &&
              ` Skipped ${plural(result.skippedDuplicates, "duplicate")}.`}{" "}
            <Link href="#coverage" className="font-semibold underline">
              See the updated coverage
            </Link>
            .
          </Banner>
        )}

        {p && (
          <section aria-labelledby={`${inputId}-preview`} className="space-y-4">
            <h3
              id={`${inputId}-preview`}
              className="text-lg font-semibold text-ink"
            >
              Preview
            </h3>
            {!fresh && (
              <Banner
                tone="neutral"
                title="You chose a different file since this preview"
              >
                Preview again before importing.
              </Banner>
            )}
            <PreviewSummary p={p} />
            {p.fileWarnings.length > 0 && (
              <Banner tone="neutral" title={p.fileWarnings.join(" ")} />
            )}
            {!hasFileErrors && <PreviewTables p={p} />}

            {!hasFileErrors && (
              <fieldset
                className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-4"
                disabled={!fresh}
              >
                <legend className="px-1 text-sm font-semibold text-ink">
                  Confirm import
                </legend>
                {invalid > 0 && (
                  <div className="flex items-start gap-2.5">
                    <input
                      id={`${inputId}-skip`}
                      type="checkbox"
                      checked={skipInvalid}
                      onChange={(e) => setSkipInvalid(e.target.checked)}
                      className="mt-1 size-5 shrink-0"
                    />
                    <label
                      htmlFor={`${inputId}-skip`}
                      className="text-sm text-ink"
                    >
                      <span className="font-medium">Skip invalid rows</span> and
                      import the {plural(ready, "valid row")}.
                      <span className="block text-ink-2">
                        Left unticked, nothing is imported until every row is
                        fixed. All-or-nothing keeps the bank consistent with
                        your file.
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={runImport}
                    disabled={!canImport}
                    aria-busy={busy === "import"}
                  >
                    {busy === "import"
                      ? "Importing…"
                      : ready > 0
                        ? `Import ${plural(ready, "question")}`
                        : "Nothing to import"}
                  </Button>
                  <p className="text-sm text-ink-2" role="status">
                    {ready === 0
                      ? "There are no new valid questions in this file."
                      : invalid > 0 && !skipInvalid
                        ? `Fix the ${plural(invalid, "error")} in your file, or tick “Skip invalid rows”.`
                        : "Imported questions are published immediately, as source “imported”."}
                  </p>
                </div>
              </fieldset>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function PreviewSummary({ p }: { p: ImportPreview }) {
  if (p.fileErrors.length > 0) {
    return (
      <Banner tone="risk" title="This file can't be imported">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {p.fileErrors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </Banner>
    );
  }
  const { total, ok, duplicates, errors } = p.counts;
  const tone = errors > 0 ? "warn" : ok > 0 ? "good" : "neutral";
  const title =
    errors > 0
      ? `${plural(errors, "row")} to fix`
      : ok > 0
        ? "Ready to import"
        : "Nothing new to import";
  return (
    <Banner tone={tone} title={title}>
      <p className="mt-0.5">
        {plural(total, "row")} checked:{" "}
        <strong>{ok.toLocaleString()} ready</strong>,{" "}
        <strong>{duplicates.toLocaleString()} duplicate</strong>,{" "}
        <strong>{errors.toLocaleString()} with errors</strong>. Row numbers
        match your spreadsheet (the header is row 1).
      </p>
    </Banner>
  );
}

function RowLabel({ r }: { r: ImportPreviewRow }) {
  return (
    <>
      {r.row}
      {r.line !== r.row && (
        <span className="block text-xs font-normal text-ink-2">
          line {r.line}
        </span>
      )}
    </>
  );
}

const Excerpt = ({ s }: { s: string }) => (
  <span className="line-clamp-2 min-w-48 max-w-md break-words">
    {s || <em className="text-ink-2">(empty)</em>}
  </span>
);

function PreviewTables({ p }: { p: ImportPreview }) {
  const errors = p.rows.filter((r) => r.status === "error");
  const dupes = p.rows.filter((r) => r.status === "duplicate");
  const ready = p.rows.filter((r) => r.status === "ok");
  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">
            Rows with errors ({errors.length.toLocaleString()})
          </h4>
          <TableWrap label="Rows with errors">
            <table className="w-full">
              <caption className="sr-only">Rows with errors</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={`${th} w-20`}>
                    Row
                  </th>
                  <th scope="col" className={th}>
                    Module
                  </th>
                  <th scope="col" className={th}>
                    Question
                  </th>
                  <th scope="col" className={th}>
                    Problems
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {errors.slice(0, SHOW).map((r) => (
                  <tr key={r.row} className="align-top">
                    <th
                      scope="row"
                      className={`${td} tabular text-left font-semibold`}
                    >
                      <RowLabel r={r} />
                    </th>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.module || <em className="text-ink-2">(empty)</em>}
                    </td>
                    <td className={td}>
                      <Excerpt s={r.stem} />
                    </td>
                    <td className={td}>
                      <ul className="min-w-56 space-y-1">
                        {r.errors.map((m, i) => (
                          <li key={i} className="text-risk">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {errors.length > SHOW && (
              <p className="px-4 py-2 text-sm text-ink-2">
                …and {(errors.length - SHOW).toLocaleString()} more. Fix these
                first and preview again.
              </p>
            )}
          </TableWrap>
        </div>
      )}

      {dupes.length > 0 && (
        <details className="rounded-lg border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-ink">
            <span>Duplicates, skipped on import</span>
            <Badge>{dupes.length.toLocaleString()}</Badge>
          </summary>
          <div className="border-t border-border">
            <TableWrap label="Duplicate rows">
              <table className="w-full">
                <caption className="sr-only">Duplicate rows</caption>
                <thead className="border-b border-border">
                  <tr>
                    <th scope="col" className={`${th} w-20`}>
                      Row
                    </th>
                    <th scope="col" className={th}>
                      Module
                    </th>
                    <th scope="col" className={th}>
                      Question
                    </th>
                    <th scope="col" className={th}>
                      Why
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dupes.slice(0, SHOW).map((r) => (
                    <tr key={r.row} className="align-top">
                      <th
                        scope="row"
                        className={`${td} tabular text-left font-semibold`}
                      >
                        <RowLabel r={r} />
                      </th>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.moduleLabel}
                      </td>
                      <td className={td}>
                        <Excerpt s={r.stem} />
                      </td>
                      <td className={td}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        </details>
      )}

      {ready.length > 0 && (
        <details
          open={errors.length === 0 && ready.length <= 8}
          className="rounded-lg border border-border bg-surface"
        >
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-ink">
            <span>Questions that will be added</span>
            <Badge tone="good">{ready.length.toLocaleString()}</Badge>
          </summary>
          <div className="space-y-3 border-t border-border">
            <p className="px-4 pt-3 text-sm text-ink-2">
              Into {plural(p.perModule.length, "module")}:{" "}
              {p.perModule
                .slice(0, 12)
                .map((m) => `${m.slug} (${m.n})`)
                .join(", ")}
              {p.perModule.length > 12
                ? `, and ${p.perModule.length - 12} more`
                : ""}
              .
            </p>
            <TableWrap label="Questions that will be added">
              <table className="w-full">
                <caption className="sr-only">
                  Questions that will be added
                </caption>
                <thead className="border-b border-border">
                  <tr>
                    <th scope="col" className={`${th} w-20`}>
                      Row
                    </th>
                    <th scope="col" className={th}>
                      Module
                    </th>
                    <th scope="col" className={th}>
                      Question
                    </th>
                    <th scope="col" className={th}>
                      Answer
                    </th>
                    <th scope="col" className={th}>
                      Difficulty
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ready.slice(0, SHOW).map((r) => (
                    <tr key={r.row} className="align-top">
                      <th
                        scope="row"
                        className={`${td} tabular text-left font-semibold`}
                      >
                        <RowLabel r={r} />
                      </th>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.moduleLabel}
                      </td>
                      <td className={td}>
                        <Excerpt s={r.stem} />
                      </td>
                      <td className={td}>{r.correctKey}</td>
                      <td className={td}>{DIFFICULTY[r.difficulty ?? 0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ready.length > SHOW && (
                <p className="px-4 py-2 text-sm text-ink-2">
                  …and {(ready.length - SHOW).toLocaleString()} more.
                </p>
              )}
            </TableWrap>
          </div>
        </details>
      )}
    </div>
  );
}
