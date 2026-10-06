// Date wording that is identical on the server and in every browser. (Intl's en-GB output differs between
// Node and Chromium builds, e.g. "Mon 5 Oct" vs "Mon, 5 Oct", which breaks hydration of server-rendered text.)
import { weekdayIndex, type ISODate } from "@/domain/dates";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const parts = (d: ISODate) => ({
  day: Number(d.slice(8, 10)),
  month: MONTHS[Number(d.slice(5, 7)) - 1] ?? "",
  wd: DAYS[weekdayIndex(d)],
});

/** "6 Oct" */
export const formatShortDate = (d: ISODate) =>
  `${parts(d).day} ${parts(d).month.slice(0, 3)}`;
/** "Tue 6 Oct" */
export const formatDay = (d: ISODate) =>
  `${parts(d).wd.slice(0, 3)} ${formatShortDate(d)}`;
/** "Tuesday 6 October" */
export const formatDayLong = (d: ISODate) =>
  `${parts(d).wd} ${parts(d).day} ${parts(d).month}`;
