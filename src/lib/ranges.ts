import { addDays, daysInMonth, isIsoDate } from "./dates";

/** Inclusive calendar-date range in the user's timezone, e.g. for daily/monthly/yearly reports. */
export interface DateRange { from: string; to: string }

export const dayRange = (date: string): DateRange => ({ from: date, to: date });

/** `month` is "YYYY-MM". */
export function monthRange(month: string): DateRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}

export function yearRange(year: number): DateRange {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) throw new Error("Invalid year");
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export const inRange = (date: string, r: DateRange) => isIsoDate(date) && date >= r.from && date <= r.to;

/** Previous/next period helpers keep report navigation free of off-by-one errors. */
export const nextDay = (r: DateRange): DateRange => dayRange(addDays(r.to, 1));
