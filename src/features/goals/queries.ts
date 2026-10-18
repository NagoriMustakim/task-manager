import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { goalProgress, type GoalProgress, type OccFact, type Priority } from "@/features/analytics/compute";
import { periodRange } from "./period";

export interface Milestone { id: string; title: string; dueDate: string | null; completedAt: string | null }
export interface LinkedTask { taskId: string; title: string; instances: number; completed: number }
export interface GoalView {
  id: string; title: string; description: string | null; status: "active" | "completed" | "archived";
  period: "weekly" | "monthly" | null; periodStart: string | null; targetCount: number | null;
  progress: GoalProgress; linkedTasks: number; linked: LinkedTask[]; milestones: Milestone[];
}

/** Goals plus progress. Progress counts logical instances (task + original date) once. */
export async function listGoals(includeArchived = false, userId?: string): Promise<GoalView[]> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  let gq = supabase.from("goals").select("id, title, description, status, period, period_start, target_count").eq("user_id", uid).order("period_start", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (!includeArchived) gq = gq.neq("status", "archived");
  const { data: goals, error } = await gq;
  if (error) throw new Error("Could not load goals.");
  if (!goals?.length) return [];
  const ids = goals.map((g) => g.id);

  const [{ data: tasks }, { data: ms }] = await Promise.all([
    supabase.from("tasks").select("id, goal_id, title, priority, category_id, estimated_minutes").in("goal_id", ids).is("archived_at", null),
    supabase.from("milestones").select("id, goal_id, title, due_date, completed_at").in("goal_id", ids).order("sort_order").order("created_at"),
  ]);
  const taskIds = (tasks ?? []).map((t) => t.id);
  const occ = taskIds.length
    ? ((await supabase.from("task_occurrences").select("id, task_id, original_date, scheduled_date, status, completed_on, completed_at, moved_to_occurrence_id").in("task_id", taskIds).limit(5000)).data ?? [])
    : [];
  const taskMeta = new Map((tasks ?? []).map((t) => [t.id, t]));

  return goals.map((g) => {
    const linked = (tasks ?? []).filter((t) => t.goal_id === g.id);
    const set = new Set(linked.map((t) => t.id));
    const facts: OccFact[] = occ.filter((o) => set.has(o.task_id)).map((o) => ({
      id: o.id, taskId: o.task_id, originalDate: o.original_date, scheduledDate: o.scheduled_date, status: o.status,
      completedOn: o.completed_on, completedAt: o.completed_at, moved: o.moved_to_occurrence_id !== null,
      priority: (taskMeta.get(o.task_id)?.priority ?? "none") as Priority, categoryId: taskMeta.get(o.task_id)?.category_id ?? null,
      estimatedMinutes: taskMeta.get(o.task_id)?.estimated_minutes ?? null,
    }));
    const period = g.period === "weekly" || g.period === "monthly" ? g.period : null;
    const range = period && g.period_start ? periodRange(period, g.period_start) : null;
    return {
      id: g.id, title: g.title, description: g.description, status: g.status, period, periodStart: g.period_start,
      targetCount: g.target_count, progress: goalProgress(facts, range, g.target_count), linkedTasks: linked.length,
      linked: linked.map((t) => { const p = goalProgress(facts.filter((f) => f.taskId === t.id), range, null); return { taskId: t.id, title: t.title, instances: p.instances, completed: p.completed }; }),
      milestones: (ms ?? []).filter((m) => m.goal_id === g.id).map((m) => ({ id: m.id, title: m.title, dueDate: m.due_date, completedAt: m.completed_at })),
    };
  });
}
