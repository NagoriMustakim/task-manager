import type { TaskItem } from "./types";
import { isOpen } from "./types";

/**
 * Three distinct counting units — never mix them:
 *  - occurrences:      rows scheduled on a date (a task rescheduled twice has 3 rows over time).
 *  - logical instances: one per (task, original date). A rescheduled chain is ONE instance.
 *  - unique tasks:     one per underlying task (a recurring task is ONE task).
 */
export const instanceKey = (i: Pick<TaskItem, "taskId" | "originalDate">) => `${i.taskId}|${i.originalDate}`;

export type DayBucket = "moved" | "done_on_time" | "done_late" | "incomplete" | "pending";

export function bucketOf(i: TaskItem): DayBucket {
  if (i.movedToId) return "moved";
  if (i.status === "done") return i.completedOn && i.completedOn > i.scheduledDate ? "done_late" : "done_on_time";
  if (i.status === "incomplete") return "incomplete";
  return "pending"; // new or pending: still open
}

export interface DaySummary {
  occurrences: number;
  uniqueTasks: number;
  moved: number;
  doneOnTime: number;
  doneLate: number;
  pending: number;
  incomplete: number;
  plannedEarlier: number;
  /** Share of occurrences that stayed on the day (moved ones excluded) and are done. */
  completionRate: number;
}

/** Summary for the occurrences scheduled on one day. */
export function summariseDay(items: TaskItem[]): DaySummary {
  const count = (b: DayBucket) => items.filter((i) => bucketOf(i) === b).length;
  const moved = count("moved");
  const doneOnTime = count("done_on_time");
  const doneLate = count("done_late");
  const staying = items.length - moved;
  return {
    occurrences: items.length,
    uniqueTasks: new Set(items.map((i) => i.taskId)).size,
    moved,
    doneOnTime,
    doneLate,
    pending: count("pending"),
    incomplete: count("incomplete"),
    plannedEarlier: items.filter((i) => i.createdDate < i.scheduledDate && i.originalDate === i.scheduledDate).length,
    completionRate: staying ? Math.round(((doneOnTime + doneLate) / staying) * 100) : 0,
  };
}

/** Range metrics (used by analytics later): a rescheduled chain completes at most once. */
export function rangeMetrics(items: TaskItem[]) {
  const doneItems = items.filter((i) => i.status === "done");
  return {
    occurrencesScheduled: items.length,
    occurrencesCompleted: doneItems.length,
    instancesCompleted: new Set(doneItems.map(instanceKey)).size,
    uniqueTasksCompleted: new Set(doneItems.map((i) => i.taskId)).size,
    uniqueTasksScheduled: new Set(items.map((i) => i.taskId)).size,
  };
}

/** Occurrences a user can still act on (carry forward / mark incomplete). */
export const isUnfinished = (i: TaskItem) => isOpen(i.status) && !i.movedToId;
export const isReschedulable = (i: TaskItem) => i.status !== "done" && !i.movedToId;
