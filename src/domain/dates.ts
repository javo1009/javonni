// Calendar-date helpers on 'YYYY-MM-DD' strings. All math is done in UTC so a
// date never shifts with the server's or the student's timezone.

export type ISODate = string; // 'YYYY-MM-DD'

const MS_PER_DAY = 86_400_000;

export function parseDate(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function formatDate(ms: number): ISODate {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return formatDate(parseDate(d) + n * MS_PER_DAY);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b) - parseDate(a)) / MS_PER_DAY);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(d: ISODate): number {
  const js = new Date(parseDate(d)).getUTCDay(); // Sun = 0
  return (js + 6) % 7;
}

export function toISODate(date: Date): ISODate {
  return formatDate(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Monday of the week containing d. */
export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekdayIndex(d));
}

export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return formatDate(parseDate(d)) === d;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
