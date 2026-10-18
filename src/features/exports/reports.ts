import type { Bucket } from "@/features/analytics/compute";
import { addDays, weekdayOf } from "@/lib/dates";
import type { Cell } from "./csv";

export const DAILY_COLUMNS = ["date", "scheduled", "due", "done", "unfinished", "completed_that_day", "on_time", "completion_rate_pct", "estimated_minutes", "recorded_minutes", "carried_forward"];
export const WEEKLY_COLUMNS = ["week_start", "week_end", "scheduled", "due", "done", "unfinished", "completed_that_week", "on_time", "completion_rate_pct", "estimated_minutes", "recorded_minutes", "carried_forward"];

const pct = (done: number, due: number) => (due > 0 ? Math.round((done / due) * 1000) / 10 : null);

export function dailyRows(series: Bucket[]): Cell[][] {
  return series.map((b) => [b.key, b.scheduled, b.due, b.done, b.unfinished, b.completedDuring, b.onTime, pct(b.done, b.due), Math.round(b.estimatedSeconds / 60), Math.round(b.actualSeconds / 60), b.carried]);
}

/** Weekly rows are summed from the daily buckets; rates are recomputed from sums, never averaged. */
export function weeklyRows(series: Bucket[], weekStartDay: number): Cell[][] {
  const weeks = new Map<string, Bucket[]>();
  for (const b of series) {
    const start = addDays(b.key, -((weekdayOf(b.key) - weekStartDay + 7) % 7));
    weeks.set(start, [...(weeks.get(start) ?? []), b]);
  }
  return [...weeks].sort(([a], [b]) => (a < b ? -1 : 1)).map(([start, days]) => {
    const sum = (f: (b: Bucket) => number) => days.reduce((n, b) => n + f(b), 0);
    const due = sum((b) => b.due), done = sum((b) => b.done);
    return [start, addDays(start, 6), sum((b) => b.scheduled), due, done, due - done, sum((b) => b.completedDuring), sum((b) => b.onTime), pct(done, due), Math.round(sum((b) => b.estimatedSeconds) / 60), Math.round(sum((b) => b.actualSeconds) / 60), sum((b) => b.carried)];
  });
}
