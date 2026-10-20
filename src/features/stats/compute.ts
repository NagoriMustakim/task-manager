import { PRIORITY_RANK, isOpen, type Priority, type Todo } from "@/features/todos/types";

/**
 * Definitions
 *  - total:  tasks planned in the range.
 *  - due:    tasks planned on or before today (future tasks are not counted against you).
 *  - done:   tasks with status Done (among due).
 *  - rate:   done ÷ due, or null when nothing is due yet.
 *  - overdue: still New/Pending and planned before today.
 */
export interface Stats {
  total: number; due: number; done: number; pending: number; fresh: number; incomplete: number; overdue: number; rate: number | null;
  byPriority: { priority: Exclude<Priority, "none">; total: number; done: number }[];
  byDay: { date: string; total: number; done: number; open: number }[];
}

const PRIORITIES: Exclude<Priority, "none">[] = ["urgent", "high", "medium", "low"];
const norm = (p: Priority): Exclude<Priority, "none"> => (p === "none" ? "medium" : p);

export function computeStats(todos: Todo[], today: string): Stats {
  const due = todos.filter((t) => t.date <= today);
  const done = due.filter((t) => t.status === "done").length;
  const byDay = new Map<string, { total: number; done: number; open: number }>();
  for (const t of todos) {
    const d = byDay.get(t.date) ?? { total: 0, done: 0, open: 0 };
    d.total++;
    if (t.status === "done") d.done++;
    if (isOpen(t.status)) d.open++;
    byDay.set(t.date, d);
  }
  return {
    total: todos.length,
    due: due.length,
    done,
    pending: todos.filter((t) => t.status === "pending").length,
    fresh: todos.filter((t) => t.status === "new").length,
    incomplete: todos.filter((t) => t.status === "incomplete").length,
    overdue: todos.filter((t) => isOpen(t.status) && t.date < today).length,
    rate: due.length ? done / due.length : null,
    byPriority: PRIORITIES.map((p) => {
      const list = todos.filter((t) => norm(t.priority) === p);
      return { priority: p, total: list.length, done: list.filter((t) => t.status === "done").length };
    }),
    byDay: [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v })),
  };
}

export { PRIORITY_RANK };
