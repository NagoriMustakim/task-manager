import { addDays, weekdayOf } from "@/lib/dates";
import { monthRange, type DateRange } from "@/lib/ranges";

/** First day of the goal's week/month containing `anchor` (weeks start on `weekStartDay`, 0 = Sunday). */
export function periodStart(period: "weekly" | "monthly", anchor: string, weekStartDay: number): string {
  if (period === "monthly") return `${anchor.slice(0, 7)}-01`;
  return addDays(anchor, -((weekdayOf(anchor) - weekStartDay + 7) % 7));
}

export function periodRange(period: "weekly" | "monthly", start: string): DateRange {
  return period === "monthly" ? monthRange(start.slice(0, 7)) : { from: start, to: addDays(start, 6) };
}

export type MilestoneState = "done" | "overdue" | "upcoming" | "undated";
/** Completed, overdue (due before today and not completed), upcoming (due today or later) or no due date. */
export function milestoneState(m: { dueDate: string | null; completedAt: string | null }, today: string): MilestoneState {
  if (m.completedAt) return "done";
  if (!m.dueDate) return "undated";
  return m.dueDate < today ? "overdue" : "upcoming";
}

/** A goal belongs in History once it is completed/archived or its week/month has ended. */
export function goalIsPast(g: { status: "active" | "completed" | "archived"; period: "weekly" | "monthly" | null; periodStart: string | null }, today: string): boolean {
  if (g.status !== "active") return true;
  return Boolean(g.period && g.periodStart && periodRange(g.period, g.periodStart).to < today);
}
