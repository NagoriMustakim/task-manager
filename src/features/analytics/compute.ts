import { addDays, dateInZone, daysBetween, weekdayOf } from "@/lib/dates";
import { inRange, type DateRange } from "@/lib/ranges";
import { splitByDay } from "@/lib/time";
import type { ClosedSession } from "@/features/time/stats";
import { granularityFor, type Granularity } from "./ranges";

/**
 * Pure aggregation. Every function takes plain facts and returns numbers, so definitions can be
 * tested against fixtures and reused later (e.g. as grounded input for AI features).
 * Metric definitions and denominators are documented in docs/analytics.md.
 */
export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export interface OccFact {
  id: string;
  taskId: string;
  originalDate: string;
  scheduledDate: string;
  status: "new" | "pending" | "done" | "incomplete";
  completedOn: string | null;
  completedAt: string | null;
  moved: boolean; // rescheduled away: frozen history, never counted as work left on that day
  priority: Priority;
  categoryId: string | null;
  estimatedMinutes: number | null;
}
export interface EventFact { taskId: string; type: "rescheduled" | "reschedule_undone"; createdAt: string }

export interface AnalyticsInput {
  range: DateRange;
  today: string;
  timeZone: string;
  /** Occurrences with scheduled_date inside the range (moved ones included). */
  scheduled: OccFact[];
  /** Done occurrences with completed_on inside the range, wherever they were scheduled. */
  completed: OccFact[];
  tasksCreated: number;
  events: EventFact[];
  sessions: ClosedSession[];
  /** Overrides the automatic bucket size (used by day-by-day exports). */
  granularity?: Granularity;
}

export interface Bucket {
  key: string;
  label: string;
  scheduled: number; // occurrences scheduled in the bucket that stayed there
  due: number; // ... and already due (scheduled <= today)
  done: number; // due occurrences that are done (at any time)
  unfinished: number; // due - done
  completedDuring: number; // occurrences completed in the bucket (by completed_on)
  onTime: number; // due occurrences completed on/before their scheduled date
  rate: number | null; // done / due, null when nothing was due
  estimatedSeconds: number;
  actualSeconds: number; // recorded time inside the bucket
  carried: number; // net reschedules performed in the bucket
}

export interface Report {
  range: DateRange;
  granularity: Granularity;
  summary: {
    uniqueTasksCreated: number;
    scheduledOccurrences: number;
    uniqueTasksScheduled: number;
    dueOccurrences: number;
    newCount: number;
    pendingCount: number;
    incompleteCount: number;
    movedCount: number;
    overdue: number;
    scheduledDone: number; // scheduled in period AND done (any time)
    completedDuringOccurrences: number; // done during the period (any schedule date)
    completedDuringInstances: number;
    completedDuringUniqueTasks: number;
    completionRate: number | null;
    onTimeRate: number | null;
    onTimeDone: number;
    lateCompleted: number;
    carriedForward: number;
    uniqueTasksCarried: number;
    postponementsPerTask: number | null;
    estimatedSeconds: number;
    actualSeconds: number;
    daysElapsed: number;
    avgDailyCompletion: number | null;
  };
  series: Bucket[];
  hourly: { hour: number; completed: number }[];
  weekday: { weekday: number; completed: number; average: number | null }[];
  priority: { priority: Priority; scheduled: number; due: number; done: number; rate: number | null }[];
  categories: { categoryId: string | null; seconds: number }[];
  postponed: { taskId: string; count: number }[];
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export const instanceKey = (o: Pick<OccFact, "taskId" | "originalDate">) => `${o.taskId}|${o.originalDate}`;

export function bucketKey(date: string, g: Granularity): string {
  return g === "month" ? date.slice(0, 7) : date;
}

function makeBuckets(range: DateRange, g: Granularity): Map<string, Bucket> {
  const m = new Map<string, Bucket>();
  const blank = (key: string, label: string): Bucket => ({ key, label, scheduled: 0, due: 0, done: 0, unfinished: 0, completedDuring: 0, onTime: 0, rate: null, estimatedSeconds: 0, actualSeconds: 0, carried: 0 });
  if (g === "month") {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const k = d.slice(0, 7);
      if (!m.has(k)) m.set(k, blank(k, k));
    }
  } else {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) m.set(d, blank(d, d.slice(5)));
  }
  return m;
}

export function computeReport(input: AnalyticsInput): Report {
  const { range, today, timeZone } = input;
  const g = input.granularity ?? granularityFor(range);
  const buckets = makeBuckets(range, g);
  const bk = (date: string) => buckets.get(bucketKey(date, g));

  // --- scheduled-in-period facts --------------------------------------------------------------
  const staying = input.scheduled.filter((o) => !o.moved);
  const due = staying.filter((o) => o.scheduledDate <= today);
  const done = due.filter((o) => o.status === "done");
  const onTime = done.filter((o) => o.completedOn !== null && o.completedOn <= o.scheduledDate);

  for (const o of staying) {
    const b = bk(o.scheduledDate);
    if (!b) continue;
    b.scheduled++;
    b.estimatedSeconds += (o.estimatedMinutes ?? 0) * 60;
    if (o.scheduledDate <= today) {
      b.due++;
      if (o.status === "done") {
        b.done++;
        if (o.completedOn !== null && o.completedOn <= o.scheduledDate) b.onTime++;
      }
    }
  }

  // --- completed-during-period facts (independent of when they were scheduled) ------------------
  const completed = input.completed.filter((o) => o.completedOn !== null && inRange(o.completedOn, range));
  for (const o of completed) {
    const b = bk(o.completedOn!);
    if (b) b.completedDuring++;
  }

  // --- time (finished sessions only), split at local midnight -----------------------------------
  const catSeconds = new Map<string | null, number>();
  let actualSeconds = 0;
  for (const s of input.sessions) {
    for (const part of splitByDay(new Date(s.startedAt), new Date(s.endedAt), timeZone)) {
      if (!inRange(part.date, range)) continue;
      actualSeconds += part.seconds;
      const b = bk(part.date);
      if (b) b.actualSeconds += part.seconds;
      catSeconds.set(s.categoryId, (catSeconds.get(s.categoryId) ?? 0) + part.seconds);
    }
  }

  // --- carry-forward / postponements from the event log -----------------------------------------
  const perTask = new Map<string, number>();
  for (const e of input.events) {
    const date = dateInZone(e.createdAt, timeZone);
    if (!inRange(date, range)) continue;
    const delta = e.type === "rescheduled" ? 1 : -1;
    perTask.set(e.taskId, (perTask.get(e.taskId) ?? 0) + delta);
    const b = bk(date);
    if (b) b.carried += delta;
  }
  const postponed = [...perTask].filter(([, c]) => c > 0).map(([taskId, count]) => ({ taskId, count })).sort((a, b) => b.count - a.count);
  const carriedForward = sum(postponed.map((p) => p.count));

  for (const b of buckets.values()) {
    b.carried = Math.max(0, b.carried);
    b.unfinished = b.due - b.done;
    b.rate = ratio(b.done, b.due);
  }

  // --- hourly (single-day ranges) ------------------------------------------------------------------
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, completed: 0 }));
  if (g === "hour") {
    for (const o of completed) {
      if (!o.completedAt) continue;
      const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit" }).format(new Date(o.completedAt)));
      if (hourly[h]) hourly[h].completed++;
    }
  }

  // --- weekday productivity ---------------------------------------------------------------------------
  const lastDay = range.to < today ? range.to : today;
  const daysElapsed = lastDay >= range.from ? daysBetween(range.from, lastDay) + 1 : 0;
  const weekdayDays = new Array<number>(7).fill(0);
  for (let i = 0; i < daysElapsed; i++) weekdayDays[weekdayOf(addDays(range.from, i))]!++;
  const weekdayDone = new Array<number>(7).fill(0);
  for (const o of completed) weekdayDone[weekdayOf(o.completedOn!)]!++;
  const weekday = weekdayDone.map((c, w) => ({ weekday: w, completed: c, average: ratio(c, weekdayDays[w]!) }));

  // --- priority ------------------------------------------------------------------------------------------
  const priority = PRIORITIES.map((p) => {
    const sched = staying.filter((o) => o.priority === p);
    const d = due.filter((o) => o.priority === p);
    const dn = d.filter((o) => o.status === "done").length;
    return { priority: p, scheduled: sched.length, due: d.length, done: dn, rate: ratio(dn, d.length) };
  });

  const open = (o: OccFact) => o.status === "new" || o.status === "pending";
  return {
    range,
    granularity: g,
    summary: {
      uniqueTasksCreated: input.tasksCreated,
      scheduledOccurrences: input.scheduled.length,
      uniqueTasksScheduled: new Set(input.scheduled.map((o) => o.taskId)).size,
      dueOccurrences: due.length,
      newCount: staying.filter((o) => o.status === "new").length,
      pendingCount: staying.filter((o) => o.status === "pending").length,
      incompleteCount: staying.filter((o) => o.status === "incomplete").length,
      movedCount: input.scheduled.filter((o) => o.moved).length,
      overdue: staying.filter((o) => open(o) && o.scheduledDate < today).length,
      scheduledDone: staying.filter((o) => o.status === "done").length,
      completedDuringOccurrences: completed.length,
      completedDuringInstances: new Set(completed.map(instanceKey)).size,
      completedDuringUniqueTasks: new Set(completed.map((o) => o.taskId)).size,
      completionRate: ratio(done.length, due.length),
      onTimeRate: ratio(onTime.length, due.length),
      onTimeDone: onTime.length,
      lateCompleted: done.length - onTime.length,
      carriedForward,
      uniqueTasksCarried: postponed.length,
      postponementsPerTask: ratio(carriedForward, postponed.length),
      estimatedSeconds: sum(staying.map((o) => (o.estimatedMinutes ?? 0) * 60)),
      actualSeconds,
      daysElapsed,
      avgDailyCompletion: ratio(completed.length, daysElapsed),
    },
    series: [...buckets.values()],
    hourly,
    weekday,
    priority,
    categories: [...catSeconds].map(([categoryId, seconds]) => ({ categoryId, seconds })).sort((a, b) => b.seconds - a.seconds),
    postponed,
  };
}

// --- weekly review helpers ---------------------------------------------------------------------------

export const OVERLOAD_PLANNED_SECONDS = 8 * 3600;
export const OVERLOAD_OCCURRENCES = 10;

/** Days whose planned estimate exceeds 8h or that hold 10+ occurrences. */
export function overloadedDays(daily: Bucket[]): Bucket[] {
  return daily.filter((b) => b.estimatedSeconds > OVERLOAD_PLANNED_SECONDS || b.scheduled >= OVERLOAD_OCCURRENCES);
}

export const REPEAT_POSTPONE_MIN = 2;
export const repeatedlyPostponed = (r: Report) => r.postponed.filter((p) => p.count >= REPEAT_POSTPONE_MIN);

export interface Delta { current: number | null; previous: number | null; change: number | null }
export function delta(current: number | null, previous: number | null): Delta {
  return { current, previous, change: current !== null && previous !== null ? current - previous : null };
}

export function compareReports(cur: Report, prev: Report) {
  return {
    completionRate: delta(cur.summary.completionRate, prev.summary.completionRate),
    onTimeRate: delta(cur.summary.onTimeRate, prev.summary.onTimeRate),
    completed: delta(cur.summary.completedDuringOccurrences, prev.summary.completedDuringOccurrences),
    scheduled: delta(cur.summary.scheduledOccurrences, prev.summary.scheduledOccurrences),
    carriedForward: delta(cur.summary.carriedForward, prev.summary.carriedForward),
    actualSeconds: delta(cur.summary.actualSeconds, prev.summary.actualSeconds),
  };
}

// --- goals ---------------------------------------------------------------------------------------------------

export interface GoalProgress { instances: number; completed: number; target: number | null; percent: number | null }

/**
 * Progress counts each logical instance (task + original date) once, however many times it was
 * rescheduled. An instance is complete when any occurrence of it is done. Only instances whose
 * original date lies in the goal's period are counted (all of them for an open-ended goal).
 */
export function goalProgress(occ: OccFact[], period: DateRange | null, targetCount: number | null): GoalProgress {
  const instances = new Map<string, boolean>();
  for (const o of occ) {
    if (period && !inRange(o.originalDate, period)) continue;
    const k = instanceKey(o);
    instances.set(k, (instances.get(k) ?? false) || o.status === "done");
  }
  const completed = [...instances.values()].filter(Boolean).length;
  const denom = targetCount ?? instances.size;
  return { instances: instances.size, completed, target: targetCount, percent: denom > 0 ? Math.min(100, Math.round((completed / denom) * 100)) : null };
}
