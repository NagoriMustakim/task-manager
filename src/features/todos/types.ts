export type Status = "new" | "pending" | "done" | "incomplete";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export interface Todo {
  id: string;
  title: string;
  priority: Priority;
  status: Status;
  date: string; // YYYY-MM-DD, the day the task is planned for
  start: string | null; // "HH:MM"
  end: string | null;
  createdAt: string;
}

export const STATUSES: readonly Status[] = ["new", "pending", "done", "incomplete"];
export const PRIORITIES: readonly Exclude<Priority, "none">[] = ["urgent", "high", "medium", "low"];

export const STATUS_LABEL: Record<Status, string> = { new: "New", pending: "Pending", done: "Done", incomplete: "Incomplete" };
export const PRIORITY_LABEL: Record<Priority, string> = { none: "Medium", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, none: 2, low: 1 };

export const isOpen = (s: Status) => s === "new" || s === "pending";

/** Day order, then priority (urgent first), then start time (untimed last), then creation order. */
export function compareTodos(a: Todo, b: Todo): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (p) return p;
  if (a.start !== b.start) {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start < b.start ? -1 : 1;
  }
  return a.createdAt < b.createdAt ? -1 : 1;
}
