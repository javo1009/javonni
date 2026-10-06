// CSV export of a homework's scores. Pure, so it is unit-tested.

/** Text starting with = + - @ (or tab/CR) is prefixed with ' so spreadsheets never run it as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvFileName(title: string, dueAt: Date): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "homework";
  return `${slug}-scores-${dueAt.toISOString().slice(0, 10)}.csv`;
}
