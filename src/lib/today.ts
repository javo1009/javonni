import type { ISODate } from "@/domain/dates";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The user's calendar date (YYYY-MM-DD) in their timezone. */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
