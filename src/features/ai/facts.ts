import { addDays } from "@/lib/dates";
import type { Report } from "@/features/analytics/compute";
import type { TaskItem } from "@/features/tasks/types";
import { Aliaser, clean } from "./payload";

/** Compact, minimal task facts for the model. No ids, notes or timestamps are included. */
export const DEFAULT_ESTIMATE_MIN = 30;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const minutesBetween = (a: string, b: string) => Math.max(0, toMin(b) - toMin(a));

export interface TaskFact {
  ref: string;
  title: string;
  priority: string;
  status: string;
  estimateMin: number | null;
  deadline: string | null;
  scheduledDate: string;
  time: string | null;
  fixed: boolean;
  timesPostponed: number;
  carriedFrom: string | null;
}

export function taskFact(item: TaskItem, aliases: Aliaser, postponed: Map<string, number>): TaskFact {
  return {
    ref: aliases.alias(item.id),
    title: clean(item.title, 120),
    priority: item.priority,
    status: item.status,
    estimateMin: item.estimatedMinutes,
    deadline: item.deadlineDate,
    scheduledDate: item.scheduledDate,
    time: item.startTime ? (item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime) : null,
    fixed: Boolean(item.startTime),
    timesPostponed: postponed.get(item.taskId) ?? 0,
    carriedFrom: item.originalDate !== item.scheduledDate ? item.originalDate : null,
  };
}

const RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
/** Highest priority, then earliest deadline first; used to cap how many tasks are sent. */
export function pickTop(items: TaskItem[], limit: number): TaskItem[] {
  return [...items]
    .sort((a, b) => (RANK[b.priority]! - RANK[a.priority]!) || (a.deadlineDate ?? "9999").localeCompare(b.deadlineDate ?? "9999") || a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, limit);
}

export const estimateOf = (i: TaskItem) => i.estimatedMinutes ?? DEFAULT_ESTIMATE_MIN;

export function fixedBlocks(items: TaskItem[]): { start: string; end: string }[] {
  return items.filter((i) => i.startTime).map((i) => {
    const s = i.startTime!;
    const end = i.endTime ?? `${String(Math.min(23, Math.floor((toMin(s) + estimateOf(i)) / 60))).padStart(2, "0")}:${String((toMin(s) + estimateOf(i)) % 60).padStart(2, "0")}`;
    return { start: s, end: toMin(end) > toMin(s) ? end : s };
  }).filter((b) => b.end > b.start);
}

/** Free working minutes per day for the coming days, from what is already scheduled. */
export function capacityByDay(upcoming: TaskItem[], today: string, workMinutes: number, days = 7) {
  const planned = new Map<string, number>();
  for (const i of upcoming) if (!i.movedToId && i.status !== "done") planned.set(i.scheduledDate, (planned.get(i.scheduledDate) ?? 0) + estimateOf(i));
  return Array.from({ length: days + 1 }, (_, d) => {
    const date = addDays(today, d);
    const committed = d === 0 ? 0 : (planned.get(date) ?? 0);
    return { daysFromToday: d, date, committedMinutes: committed, freeMinutes: Math.max(0, workMinutes - committed) };
  });
}

/** Flat, named numbers taken straight from server-computed reports. The model may cite only these names. */
export function buildMetricsDict(cur: Report, prev: Report | null, extra: Record<string, number | null> = {}): Record<string, number | null> {
  const s = cur.summary;
  const out: Record<string, number | null> = {
    uniqueTasksCreated: s.uniqueTasksCreated, scheduledOccurrences: s.scheduledOccurrences, uniqueTasksScheduled: s.uniqueTasksScheduled,
    dueOccurrences: s.dueOccurrences, completedInPeriod: s.completedDuringOccurrences, completedUniqueTasks: s.completedDuringUniqueTasks,
    completionRatePct: s.completionRate === null ? null : Math.round(s.completionRate * 100),
    onTimeRatePct: s.onTimeRate === null ? null : Math.round(s.onTimeRate * 100),
    lateCompleted: s.lateCompleted, newCount: s.newCount, pendingCount: s.pendingCount, incompleteCount: s.incompleteCount,
    overdue: s.overdue, carriedForward: s.carriedForward, uniqueTasksCarried: s.uniqueTasksCarried, postponementsPerTask: s.postponementsPerTask === null ? null : Math.round(s.postponementsPerTask * 10) / 10,
    estimatedMinutes: Math.round(s.estimatedSeconds / 60), recordedMinutes: Math.round(s.actualSeconds / 60),
    avgDailyCompletion: s.avgDailyCompletion === null ? null : Math.round(s.avgDailyCompletion * 10) / 10,
    ...extra,
  };
  if (prev) {
    const p = prev.summary;
    out.prev_completionRatePct = p.completionRate === null ? null : Math.round(p.completionRate * 100);
    out.prev_onTimeRatePct = p.onTimeRate === null ? null : Math.round(p.onTimeRate * 100);
    out.prev_completedInPeriod = p.completedDuringOccurrences;
    out.prev_scheduledOccurrences = p.scheduledOccurrences;
    out.prev_carriedForward = p.carriedForward;
    out.prev_recordedMinutes = Math.round(p.actualSeconds / 60);
    const curPct = s.completionRate === null ? null : Math.round(s.completionRate * 100);
    const prevPct = p.completionRate === null ? null : Math.round(p.completionRate * 100);
    out.change_completionRatePts = curPct !== null && prevPct !== null ? curPct - prevPct : null;
    out.change_completedInPeriod = s.completedDuringOccurrences - p.completedDuringOccurrences;
  }
  return out;
}

export const metricNames = (d: Record<string, unknown>) => new Set(Object.keys(d));
