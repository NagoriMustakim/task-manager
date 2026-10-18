import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { DEFAULT_TIMEZONE, dateInZone, todayIn, trimTime } from "@/lib/dates";
import type { Category, TaskItem } from "./types";

export const OCCURRENCE_SELECT =
  "id, task_id, scheduled_date, original_date, status, start_time, end_time, completed_at, completed_on, " +
  "moved_to_occurrence_id, moved_at, moved_reason, created_at, updated_at, " +
  "tasks!inner(title, notes, priority, category_id, goal_id, deadline_date, estimated_minutes, archived_at, created_at, recurrence_rule)";

export type OccurrenceRow = {
  id: string;
  task_id: string;
  scheduled_date: string;
  original_date: string;
  status: TaskItem["status"];
  start_time: string | null;
  end_time: string | null;
  completed_at: string | null;
  completed_on: string | null;
  moved_to_occurrence_id: string | null;
  moved_at: string | null;
  moved_reason: string | null;
  created_at: string;
  updated_at: string;
  tasks: {
    title: string;
    notes: string | null;
    priority: TaskItem["priority"];
    category_id: string | null;
    goal_id: string | null;
    deadline_date: string | null;
    estimated_minutes: number | null;
    archived_at: string | null;
    created_at: string;
    recurrence_rule: string | null;
  };
};

/** Rows -> items, resolving tracked time and the destination date of moved rows. */
export async function hydrate(rows: OccurrenceRow[], timezone: string): Promise<TaskItem[]> {
  const supabase = await createClient();
  const movedIds = rows.map((r) => r.moved_to_occurrence_id).filter((v): v is string => Boolean(v));

  const taskIds = [...new Set(rows.map((r) => r.task_id))];
  const [sessions, dests] = await Promise.all([
    taskIds.length
      ? supabase.from("time_sessions").select("task_id, occurrence_id, duration_seconds").in("task_id", taskIds).not("ended_at", "is", null)
      : Promise.resolve({ data: [] as { task_id: string; occurrence_id: string | null; duration_seconds: number | null }[] }),
    movedIds.length
      ? supabase.from("task_occurrences").select("id, scheduled_date").in("id", movedIds)
      : Promise.resolve({ data: [] as { id: string; scheduled_date: string }[] }),
  ]);

  // Only FINISHED sessions count; a running timer has no duration yet.
  const byOcc = new Map<string, number>();
  const byTask = new Map<string, number>();
  for (const s of sessions.data ?? []) {
    const d = s.duration_seconds ?? 0;
    byTask.set(s.task_id, (byTask.get(s.task_id) ?? 0) + d);
    if (s.occurrence_id) byOcc.set(s.occurrence_id, (byOcc.get(s.occurrence_id) ?? 0) + d);
  }
  const destDate = new Map((dests.data ?? []).map((d) => [d.id, d.scheduled_date]));

  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    title: r.tasks.title,
    notes: r.tasks.notes,
    priority: r.tasks.priority,
    status: r.status,
    scheduledDate: r.scheduled_date,
    originalDate: r.original_date,
    startTime: trimTime(r.start_time),
    endTime: trimTime(r.end_time),
    estimatedMinutes: r.tasks.estimated_minutes,
    deadlineDate: r.tasks.deadline_date,
    categoryId: r.tasks.category_id,
    goalId: r.tasks.goal_id,
    completedAt: r.completed_at,
    completedOn: r.completed_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    trackedSeconds: byOcc.get(r.id) ?? 0,
    taskTrackedSeconds: byTask.get(r.task_id) ?? 0,
    createdDate: dateInZone(r.tasks.created_at, timezone),
    movedToId: r.moved_to_occurrence_id,
    movedToDate: r.moved_to_occurrence_id ? (destDate.get(r.moved_to_occurrence_id) ?? null) : null,
    movedReason: r.moved_reason,
    movedAt: r.moved_at,
    recurrenceRule: r.tasks.recurrence_rule,
  }));
}

export type ItemFilter =
  | { kind: "day"; date: string }
  | { kind: "overdue"; before: string }
  | { kind: "completedOn"; date: string }
  | { kind: "upcoming"; after: string }
  | { kind: "all"; status?: TaskItem["status"] | undefined; q?: string | undefined; hideRepeatsAfter?: string | undefined };

/** All reads run under the caller's JWT: RLS limits rows to the signed-in user. */
export async function listItems(filter: ItemFilter, timezone: string, limit = 300, userId?: string): Promise<TaskItem[]> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const hideRepeatsAfter = filter.kind === "all" ? filter.hideRepeatsAfter : undefined;
  let q = supabase.from("task_occurrences").select(OCCURRENCE_SELECT).eq("user_id", uid).is("tasks.archived_at", null);
  switch (filter.kind) {
    case "day":
      q = q.eq("scheduled_date", filter.date);
      break;
    case "completedOn":
      q = q.eq("status", "done").eq("completed_on", filter.date);
      break;
    case "overdue":
      q = q.lt("scheduled_date", filter.before).in("status", ["new", "pending"]).is("moved_to_occurrence_id", null);
      break;
    case "upcoming":
      q = q.gt("scheduled_date", filter.after).is("moved_to_occurrence_id", null);
      break;
    case "all":
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.q) q = q.ilike("tasks.title", `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`);
      break;
  }
  const { data, error } = await q
    .order("scheduled_date", { ascending: filter.kind === "upcoming" || filter.kind === "overdue" })
    .order("start_time", { ascending: true, nullsFirst: false })
    .limit(hideRepeatsAfter ? limit * 3 : limit)
    .returns<OccurrenceRow[]>();
  if (error) throw new Error("Could not load tasks.");
  const items = await hydrate(data ?? [], timezone);
  // Repeating tasks are generated weeks ahead; those far-future copies belong on Upcoming, not in the full list.
  return hideRepeatsAfter ? items.filter((i) => !(i.recurrenceRule && i.scheduledDate > hideRepeatsAfter)).slice(0, limit) : items;
}

const categoriesFor = cache(async (uid: string): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name, color").eq("user_id", uid).is("archived_at", null).order("name");
  if (error) throw new Error("Could not load categories.");
  return data ?? [];
});
export const listCategories = async (userId?: string): Promise<Category[]> => categoriesFor(userId ?? (await currentUserId()));

const settingsFor = cache(async (uid: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("timezone, last_review_date, week_start_day, work_start, work_end").eq("user_id", uid).maybeSingle();
  const timezone = data?.timezone ?? DEFAULT_TIMEZONE;
  return {
    timezone,
    today: todayIn(timezone),
    lastReviewDate: data?.last_review_date ?? null,
    weekStartDay: data?.week_start_day ?? 1,
    workStart: trimTime(data?.work_start ?? "09:00") ?? "09:00",
    workEnd: trimTime(data?.work_end ?? "18:00") ?? "18:00",
  };
});
export const getUserSettings = async (userId?: string) => settingsFor(userId ?? (await currentUserId()));

/** Back-compat alias used by pages. */
export const getUserToday = getUserSettings;

export async function getItemsByIds(ids: string[], timezone: string, userId?: string): Promise<TaskItem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const { data, error } = await supabase.from("task_occurrences").select(OCCURRENCE_SELECT).eq("user_id", uid).in("id", ids).returns<OccurrenceRow[]>();
  if (error) throw new Error("Could not load tasks.");
  return hydrate(data ?? [], timezone);
}

const goalOptionsFor = cache(async (uid: string): Promise<{ id: string; title: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("goals").select("id, title").eq("user_id", uid).eq("status", "active").order("created_at", { ascending: false }).limit(100);
  return data ?? [];
});
export const listGoalOptions = async (userId?: string) => goalOptionsFor(userId ?? (await currentUserId()));
