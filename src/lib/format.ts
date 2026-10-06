import { parseDate, type ISODate } from "@/domain/dates";

/** 95 -> "1 h 35 min" */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Tue 6 Oct" */
export const formatDay = (d: ISODate) => dayFmt.format(new Date(parseDate(d)));
/** "Tuesday 6 October" */
export const formatDayLong = (d: ISODate) => longFmt.format(new Date(parseDate(d)));
/** "6 Oct" */
export const formatShortDate = (d: ISODate) => shortFmt.format(new Date(parseDate(d)));

export function formatDateTime(d: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(d);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function hours(minutes: number) {
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)} h` : `${Math.round(h * 10) / 10} h`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
