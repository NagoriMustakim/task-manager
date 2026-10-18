import { addDays, weekdayOf } from "@/lib/dates";
import { dayRange, inRange, monthRange, yearRange, type DateRange } from "@/lib/ranges";
import { splitByDay } from "@/lib/time";

/** A FINISHED session (ended_at set). Running timers are deliberately not representable here. */
export interface ClosedSession {
  taskId: string;
  occurrenceId: string | null;
  categoryId: string | null;
  taskTitle: string;
  estimatedMinutes: number | null;
  startedAt: string;
  endedAt: string;
}

export interface Ranges { today: DateRange; yesterday: DateRange; week: DateRange; month: DateRange; year: DateRange }

export function buildRanges(today: string, weekStartDay: number): Ranges {
  const back = (weekdayOf(today) - weekStartDay + 7) % 7;
  const weekFrom = addDays(today, -back);
  return {
    today: dayRange(today),
    yesterday: dayRange(addDays(today, -1)),
    week: { from: weekFrom, to: addDays(weekFrom, 6) },
    month: monthRange(today.slice(0, 7)),
    year: yearRange(Number(today.slice(0, 4))),
  };
}

export interface RangeTotals {
  totalSeconds: number;
  byTask: Map<string, { title: string; seconds: number }>;
  byCategory: Map<string, number>; // key "" = uncategorised
}

/**
 * Seconds per range. Each session is split at local midnights of `timeZone`, so a session
 * that crosses midnight (or a month/year end) contributes to each side correctly.
 */
export function aggregate(sessions: ClosedSession[], timeZone: string, ranges: Ranges): Record<keyof Ranges, RangeTotals> {
  const keys = Object.keys(ranges) as (keyof Ranges)[];
  const out = Object.fromEntries(keys.map((k) => [k, { totalSeconds: 0, byTask: new Map(), byCategory: new Map() } as RangeTotals])) as Record<keyof Ranges, RangeTotals>;
  for (const s of sessions) {
    for (const part of splitByDay(new Date(s.startedAt), new Date(s.endedAt), timeZone)) {
      for (const k of keys) {
        if (!inRange(part.date, ranges[k])) continue;
        const t = out[k];
        t.totalSeconds += part.seconds;
        const task = t.byTask.get(s.taskId) ?? { title: s.taskTitle, seconds: 0 };
        task.seconds += part.seconds;
        t.byTask.set(s.taskId, task);
        const cat = s.categoryId ?? "";
        t.byCategory.set(cat, (t.byCategory.get(cat) ?? 0) + part.seconds);
      }
    }
  }
  return out;
}

export interface EstimateRow {
  taskId: string;
  title: string;
  estimateSeconds: number;
  actualSeconds: number;
  /** actual - estimate (positive = over). Estimate is per occurrence, actual is the task total. */
  varianceSeconds: number;
  trackedOccurrences: number;
  overOccurrences: number;
  consistentlyOver: boolean;
}

/** Minimum tracked occurrences before "consistently" is meaningful, and the share that must exceed. */
export const CONSISTENT_MIN_OCCURRENCES = 3;
export const CONSISTENT_SHARE = 2 / 3;

/**
 * Estimated vs actual. The estimate belongs to the task and applies to each occurrence, so
 * "over" is judged per occurrence (tracked seconds on that occurrence vs the estimate) and a
 * task is "consistently over" when enough tracked occurrences exceeded it.
 */
export function estimateReport(sessions: ClosedSession[]): EstimateRow[] {
  const tasks = new Map<string, { title: string; estimateMin: number; perOcc: Map<string, number>; total: number }>();
  for (const s of sessions) {
    if (!s.estimatedMinutes) continue;
    const t = tasks.get(s.taskId) ?? { title: s.taskTitle, estimateMin: s.estimatedMinutes, perOcc: new Map(), total: 0 };
    const secs = Math.max(0, Math.floor((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000));
    const key = s.occurrenceId ?? "none";
    t.perOcc.set(key, (t.perOcc.get(key) ?? 0) + secs);
    t.total += secs;
    t.estimateMin = s.estimatedMinutes;
    tasks.set(s.taskId, t);
  }
  return [...tasks].map(([taskId, t]) => {
    const est = t.estimateMin * 60;
    const occ = [...t.perOcc.values()].filter((v) => v > 0);
    const over = occ.filter((v) => v > est).length;
    return {
      taskId, title: t.title, estimateSeconds: est, actualSeconds: t.total,
      varianceSeconds: t.total - est * Math.max(1, occ.length),
      trackedOccurrences: occ.length, overOccurrences: over,
      consistentlyOver: occ.length >= CONSISTENT_MIN_OCCURRENCES && over / occ.length >= CONSISTENT_SHARE,
    };
  });
}
