// Renders an import preview: problems first, then what the file contains and how it differs.
import type { ReactNode } from "react";
import { Badge, Banner, TableWrap, td, th } from "@/components/ui";
import type { CsvIssue } from "@/domain/curriculum-csv";
import type { ImportPreview } from "@/services/admin";

const SHOW = 100;

function more(n: number) {
  return n > SHOW ? <p className="px-4 py-2 text-sm text-ink-2">…and {(n - SHOW).toLocaleString()} more.</p> : null;
}

function IssueTable({ label, issues }: { label: string; issues: CsvIssue[] }) {
  return (
    <TableWrap label={label}>
      <table className="w-full">
        <caption className="sr-only">{label}</caption>
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className={`${th} w-24`}>
              Row
            </th>
            <th scope="col" className={th}>
              Problem
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {issues.slice(0, SHOW).map((e, i) => (
            <tr key={i}>
              <td className={`${td} tabular`}>{e.row === 0 ? "File" : e.row}</td>
              <td className={td}>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more(issues.length)}
    </TableWrap>
  );
}

function DiffSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="group rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-ink">
        <span>{title}</span>
        <Badge>{count.toLocaleString()}</Badge>
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

export function ImportPreviewView({ preview: p }: { preview: ImportPreview }) {
  const d = p.diff;
  const hasErrors = p.errors.length > 0;
  return (
    <section aria-labelledby="preview-h" className="space-y-5">
      <h3 id="preview-h" className="text-lg font-semibold text-ink">
        Preview
      </h3>
      {hasErrors ? (
        <Banner tone="risk" title={`${p.errors.length.toLocaleString()} ${p.errors.length === 1 ? "error" : "errors"}: fix ${p.errors.length === 1 ? "it" : "them"} before importing`}>
          Row numbers match your spreadsheet (the header is row 1).
        </Banner>
      ) : (
        <Banner tone="good" title="Ready to import">
          {p.stats.topics} topics, {p.stats.modules} modules and {p.stats.los.toLocaleString()} objectives.
          {p.warnings.length > 0 && ` ${p.warnings.length} ${p.warnings.length === 1 ? "warning" : "warnings"} to review below.`}
        </Banner>
      )}

      {hasErrors && <IssueTable label="Errors" issues={p.errors} />}

      {p.warnings.length > 0 && (
        <details open={!hasErrors && p.warnings.length <= 10} className="rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink">
            {p.warnings.length.toLocaleString()} {p.warnings.length === 1 ? "warning" : "warnings"} (importable, but worth a look)
          </summary>
          <div className="border-t border-border p-3">
            <IssueTable label="Warnings" issues={p.warnings} />
          </div>
        </details>
      )}

      {p.topics.length > 0 && (
        <TableWrap label="Topics in this file">
          <table className="w-full">
            <caption className="px-4 pt-3 text-left text-sm font-semibold text-ink">Topics in this file</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className={th}>
                  Code
                </th>
                <th scope="col" className={th}>
                  Topic
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Weight
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Modules
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Objectives
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.topics.map((t) => (
                <tr key={t.code}>
                  <td className={`${td} font-mono text-xs`}>{t.code}</td>
                  <td className={td}>{t.name}</td>
                  <td className={`${td} tabular text-right`}>
                    {t.weightMin}–{t.weightMax}%
                  </td>
                  <td className={`${td} tabular text-right`}>{t.modules}</td>
                  <td className={`${td} tabular text-right`}>{t.los}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {d && p.against && p.stats.los > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-ink">
            Changes compared with the active version <span className="font-normal text-ink-2">({p.against.name})</span>
          </h4>
          {p.against.isSample && (
            <p className="text-sm text-ink-2">The active version is the sample curriculum, so most objectives will show as added or removed. That is expected.</p>
          )}
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Change summary">
            <li>
              <Badge tone="good">{d.addedLos.length} added</Badge>
            </li>
            <li>
              <Badge tone="risk">{d.removedLos.length} removed</Badge>
            </li>
            <li>
              <Badge tone="warn">{d.rewordedLos.length} reworded</Badge>
            </li>
            <li>
              <Badge tone="brand">{d.movedLos.length} moved</Badge>
            </li>
            <li>
              <Badge>{d.unchangedLos} unchanged</Badge>
            </li>
            {d.topicChanges.length + d.addedTopics.length + d.removedTopics.length > 0 && (
              <li>
                <Badge tone="warn">{d.topicChanges.length + d.addedTopics.length + d.removedTopics.length} topic changes</Badge>
              </li>
            )}
          </ul>

          <DiffSection title="Topic changes" count={d.topicChanges.length + d.addedTopics.length + d.removedTopics.length}>
            <ul className="divide-y divide-border text-sm">
              {d.addedTopics.map((t) => (
                <li key={`a-${t.code}`} className="px-4 py-2">
                  <strong>Added</strong> {t.code} · {t.name} ({t.weightMin}–{t.weightMax}%)
                </li>
              ))}
              {d.removedTopics.map((t) => (
                <li key={`r-${t.code}`} className="px-4 py-2">
                  <strong>Removed</strong> {t.code} · {t.name}
                </li>
              ))}
              {d.topicChanges.map((t) => (
                <li key={`c-${t.code}`} className="px-4 py-2">
                  <strong>Changed</strong> {t.code}:{" "}
                  {t.oldName !== t.newName && (
                    <>
                      renamed “{t.oldName}” → “{t.newName}”.{" "}
                    </>
                  )}
                  {(t.oldWeight[0] !== t.newWeight[0] || t.oldWeight[1] !== t.newWeight[1]) && (
                    <>
                      weight {t.oldWeight[0]}–{t.oldWeight[1]}% → {t.newWeight[0]}–{t.newWeight[1]}%.
                    </>
                  )}
                </li>
              ))}
            </ul>
          </DiffSection>
          <DiffSection title="Added objectives" count={d.addedLos.length}>
            <ul className="divide-y divide-border text-sm">
              {d.addedLos.slice(0, SHOW).map((l) => (
                <li key={l.code} className="px-4 py-2">
                  <span className="font-mono text-xs">{l.code}</span> {l.text}
                </li>
              ))}
            </ul>
            {more(d.addedLos.length)}
          </DiffSection>
          <DiffSection title="Removed objectives" count={d.removedLos.length}>
            <ul className="divide-y divide-border text-sm">
              {d.removedLos.slice(0, SHOW).map((l) => (
                <li key={l.code} className="px-4 py-2">
                  <span className="font-mono text-xs">{l.code}</span> {l.text}
                </li>
              ))}
            </ul>
            {more(d.removedLos.length)}
          </DiffSection>
          <DiffSection title="Reworded objectives" count={d.rewordedLos.length}>
            <ul className="divide-y divide-border text-sm">
              {d.rewordedLos.slice(0, SHOW).map((l) => (
                <li key={l.code} className="space-y-1 px-4 py-2">
                  <p className="font-mono text-xs">{l.code}</p>
                  <p>
                    <span className="font-medium text-ink-2">Was:</span> <del className="text-ink-2">{l.oldText}</del>
                  </p>
                  <p>
                    <span className="font-medium text-ink-2">Now:</span> <ins className="no-underline">{l.newText}</ins>
                  </p>
                  {l.oldCommandWord.toLowerCase() !== l.newCommandWord.toLowerCase() && (
                    <p className="text-ink-2">
                      Command word {l.oldCommandWord} → {l.newCommandWord}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {more(d.rewordedLos.length)}
          </DiffSection>
          <DiffSection title="Moved objectives" count={d.movedLos.length}>
            <ul className="divide-y divide-border text-sm">
              {d.movedLos.slice(0, SHOW).map((l) => (
                <li key={l.code} className="px-4 py-2">
                  <span className="font-mono text-xs">{l.code}</span> {l.from} → {l.to}
                </li>
              ))}
            </ul>
            {more(d.movedLos.length)}
          </DiffSection>
        </div>
      )}
    </section>
  );
}
