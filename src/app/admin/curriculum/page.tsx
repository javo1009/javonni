import type { Metadata } from "next";
import { ActivateVersion } from "@/components/admin/activate-version";
import { ImportPanel } from "@/components/admin/import-panel";
import { Badge, Banner, Card, CardBody, CardHeader, PageHeader, TableWrap, td, th } from "@/components/ui";
import { OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from "@/domain/curriculum-csv";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { listVersions } from "@/services/admin";

export const metadata: Metadata = { title: "Curriculum" };

const OUTLINE_URL = "https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam";

const COLUMN_HELP: Record<string, string> = {
  topic_code: "Short code, no spaces (e.g. ETH). Repeat on every row of the topic.",
  topic_name: "Same on every row of the topic.",
  weight_min: "Exam weight range, whole percent 0–100.",
  weight_max: "Must be ≥ weight_min.",
  module_title: "Rows with the same title (within a topic) form one module.",
  est_minutes: "Study minutes for the module. Blank = 180.",
  los_code: "Unique objective code (e.g. ETH.1.a).",
  command_word: "Verb such as describe, calculate. Blank = first word of the text.",
  los_text: "The objective. See the licensing note.",
  importance: "1 (low) to 3 (high). Blank = 2.",
  topic_difficulty: "Optional. 1–3, default 2. Weights plan time.",
  topic_spread: "Optional. true to spread the topic across the plan (e.g. Ethics).",
};

export default async function CurriculumPage() {
  const { actor, db, user, today } = await adminContext();
  const versions = await listVersions(db, actor);
  const defaultYear = Math.max(2027, Number(today.slice(0, 4)));

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Curriculum"
        description="Topics, modules and learning objectives are data. Import a version from CSV, check the differences, then make it active."
      />

      <div className="mb-6">
        <Banner tone="warn" title="Get the official outline from CFA Institute, and check licensing">
          <p>
            Ascent does not ship the official 2027 Level I learning outcome statements. Download the topic outline from{" "}
            <a href={OUTLINE_URL} className="font-medium underline" target="_blank" rel="noreferrer">
              CFA Institute
            </a>{" "}
            and transcribe it into the CSV format below. Before showing verbatim objective text to students, confirm that CFA Institute&apos;s terms
            allow it; if not, use the codes with short paraphrases of your own.
          </p>
        </Banner>
      </div>

      <Card className="mb-6" aria-labelledby="versions-h">
        <CardHeader id="versions-h" title="Versions" subtitle="Exactly one version is active. New study plans use it; existing plans keep the version they were built from." />
        <CardBody>
          {versions.length === 0 ? (
            <p className="text-sm text-ink-2">No versions yet. Import one below.</p>
          ) : (
            <TableWrap label="Curriculum versions">
              <table className="w-full">
                <caption className="sr-only">Curriculum versions</caption>
                <thead className="border-b border-border">
                  <tr>
                    <th scope="col" className={th}>
                      Version
                    </th>
                    <th scope="col" className={th}>
                      Status
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Topics
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Objectives
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      Active plans
                    </th>
                    <th scope="col" className={th}>
                      Created
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {versions.map((v) => (
                    <tr key={v.id} className={v.isActive ? "bg-brand-soft/40" : undefined}>
                      <td className={td}>
                        <p className="font-medium text-ink">{v.name}</p>
                        <p className="text-xs text-ink-2">
                          Level {v.level} · {v.year}
                          {v.sourceNote && <> · {v.sourceNote.length > 90 ? `${v.sourceNote.slice(0, 90)}…` : v.sourceNote}</>}
                        </p>
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {v.isActive ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}
                          {v.isSample && <Badge tone="risk">Sample</Badge>}
                        </div>
                      </td>
                      <td className={`${td} tabular text-right`}>{v.topics}</td>
                      <td className={`${td} tabular text-right`}>{v.los.toLocaleString()}</td>
                      <td className={`${td} tabular text-right`}>{v.activePlans}</td>
                      <td className={`${td} whitespace-nowrap text-ink-2`}>
                        <time dateTime={v.createdAt.toISOString()}>{formatDateTime(v.createdAt, user.timezone)}</time>
                      </td>
                      <td className={`${td} text-right`}>
                        <div className="flex flex-col items-end gap-1.5">
                          {!v.isActive && <ActivateVersion versionId={v.id} name={v.name} />}
                          <a href={`/admin/curriculum/export/${v.id}`} className="whitespace-nowrap text-sm font-medium text-brand hover:underline" aria-label={`Download ${v.name} as CSV`}>
                            Download CSV
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          {versions.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              {plural(versions.length, "version")} stored. Versions are never edited in place: to fix a typo, download the CSV, correct it and import it as a new
              version.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6" aria-labelledby="import-h">
        <CardHeader id="import-h" title="Import a new version" />
        <CardBody>
          <ImportPanel defaultYear={defaultYear} />
        </CardBody>
      </Card>

      <Card aria-labelledby="format-h">
        <CardHeader id="format-h" title="CSV format" subtitle="UTF-8, comma-separated (semicolons also work), header row first. Quote fields that contain commas, quotes or line breaks." />
        <CardBody>
          <TableWrap label="CSV columns">
            <table className="w-full">
              <caption className="sr-only">CSV columns</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>
                    Column
                  </th>
                  <th scope="col" className={th}>
                    Required
                  </th>
                  <th scope="col" className={th}>
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((c) => (
                  <tr key={c}>
                    <td className={`${td} font-mono text-xs`}>{c}</td>
                    <td className={td}>{(OPTIONAL_COLUMNS as readonly string[]).includes(c) ? "Optional column" : "Column required"}</td>
                    <td className={`${td} text-ink-2`}>{COLUMN_HELP[c]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </CardBody>
      </Card>
    </>
  );
}
