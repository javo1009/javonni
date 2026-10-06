// Deterministic date labels for client components: Intl output differs between
// Node and browsers ("Tue 22 Sept" vs "Tue, 22 Sept"), which breaks hydration.
import { parseDate, type ISODate } from "@/domain/dates";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 22 Sep" */
export function dayLabel(d: ISODate): string {
  const dt = new Date(parseDate(d));
  return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MO[dt.getUTCMonth()]}`;
}
