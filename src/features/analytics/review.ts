import { addDays } from "@/lib/dates";
import { isUnfinished } from "@/features/tasks/metrics";
import type { TaskItem } from "@/features/tasks/types";

export interface Recommendation { item: TaskItem; recommended: boolean; reasons: string[] }

/**
 * Deterministic carry-forward suggestions for unfinished work (no AI). A task is recommended when
 *  - its priority is high or urgent, or
 *  - its deadline is within 2 days of `asOf` (or already passed), or
 *  - it is already in progress (Pending).
 * Everything else stays selectable but is not pre-selected, so low-value work can be dropped
 * deliberately instead of drifting forward.
 */
export function recommendCarryForward(items: TaskItem[], asOf: string): Recommendation[] {
  const soon = addDays(asOf, 2);
  return items.filter(isUnfinished).map((item) => {
    const reasons: string[] = [];
    if (item.priority === "high" || item.priority === "urgent") reasons.push(`${item.priority} priority`);
    if (item.deadlineDate && item.deadlineDate <= soon) reasons.push(item.deadlineDate < asOf ? "deadline passed" : "deadline soon");
    if (item.status === "pending") reasons.push("in progress");
    return { item, recommended: reasons.length > 0, reasons };
  }).sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export const highPriorityUnfinished = (items: TaskItem[]) =>
  items.filter((i) => isUnfinished(i) && (i.priority === "high" || i.priority === "urgent"));

/** "Underestimated": recorded time is at least 125% of the estimate(s) for the tasks that have both. */
export const UNDERESTIMATE_FACTOR = 1.25;
export function isUnderestimated(row: { estimateSeconds: number; actualSeconds: number; trackedOccurrences: number }): boolean {
  return row.actualSeconds >= row.estimateSeconds * Math.max(1, row.trackedOccurrences) * UNDERESTIMATE_FACTOR;
}
