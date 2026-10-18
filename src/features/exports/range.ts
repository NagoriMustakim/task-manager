import { addDays, daysBetween, isIsoDate } from "@/lib/dates";

export const MAX_EXPORT_DAYS = 366;
export const MAX_EXPORT_ROWS = 50_000;

/** Validates export dates; defaults to the last 30 days ending today. */
export function parseExportRange(from: string | null, to: string | null, today: string): { from: string; to: string } | { error: string } {
  const f = from ?? addDays(today, -29);
  const t = to ?? today;
  if (!isIsoDate(f) || !isIsoDate(t)) return { error: "Dates must be valid (YYYY-MM-DD)." };
  if (f > t) return { error: "The start date is after the end date." };
  if (daysBetween(f, t) + 1 > MAX_EXPORT_DAYS) return { error: `Choose a range of at most ${MAX_EXPORT_DAYS} days.` };
  return { from: f, to: t };
}
