import type { Database } from "@/types/database";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export interface Category {
  id: string;
  name: string;
  color: string | null;
}

/** One scheduled occurrence joined with its parent task: the unit shown in every list. */
export interface TaskItem {
  id: string; // occurrence id
  taskId: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  scheduledDate: string;
  originalDate: string; // first date this instance was scheduled; constant along a reschedule chain
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  estimatedMinutes: number | null;
  deadlineDate: string | null;
  categoryId: string | null;
  goalId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  trackedSeconds: number; // finished sessions on THIS occurrence (running timers excluded)
  taskTrackedSeconds: number; // finished sessions across all occurrences of the task
  completedOn: string | null; // user's calendar date at completion time (timezone-stable)
  createdDate: string; // task creation date in the user's timezone
  movedToId: string | null; // set => this occurrence was rescheduled (read-only history)
  movedToDate: string | null;
  movedReason: string | null;
  movedAt: string | null;
  recurrenceRule: string | null;
}

export const STATUSES: readonly TaskStatus[] = ["new", "pending", "done", "incomplete"];
export const PRIORITIES: readonly Exclude<TaskPriority, "none">[] = ["low", "medium", "high", "urgent"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: "New",
  pending: "Pending",
  done: "Done",
  incomplete: "Incomplete",
};
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

export const isOpen = (s: TaskStatus) => s === "new" || s === "pending";

/** Sort: timed tasks by time first, then priority (high first), then creation order. */
export function compareItems(a: TaskItem, b: TaskItem): number {
  if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate < b.scheduledDate ? -1 : 1;
  if (a.startTime !== b.startTime) {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime < b.startTime ? -1 : 1;
  }
  const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (p) return p;
  return a.createdAt < b.createdAt ? -1 : 1;
}
