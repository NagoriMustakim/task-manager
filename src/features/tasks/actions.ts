"use server";

import { createClient } from "@/lib/supabase/server";
import {
  bulkStatusSchema,
  createCategorySchema,
  createTaskSchema,
  rescheduleSchema,
  timezoneSchema,
  updateOccurrenceSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type OccurrencePatch,
  type RescheduleInput,
  type TaskPatch,
} from "./schemas";
import { getItemsByIds, getUserSettings } from "./queries";
import type { Database } from "@/types/database";
import type { Category, TaskItem, TaskStatus } from "./types";

type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const GENERIC = "Something went wrong. Try again.";
const SESSION_ENDED = "Your session has ended. Sign in again.";

/**
 * Every action runs with the signed-in user's JWT (RLS applies). Authorisation is therefore
 * enforced by the database; we additionally require a verified user here.
 */
async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<TaskItem>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const v = parsed.data;
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);

  const { data: occId, error } = await a.supabase.rpc("create_task_with_occurrence", {
    p_title: v.title,
    p_date: v.date,
    p_priority: v.priority,
    p_notes: v.notes ?? null,
    p_category_id: v.categoryId ?? null,
    p_deadline: v.deadline ?? null,
    p_estimated_minutes: v.estimatedMinutes ?? null,
    p_start: v.startTime ?? null,
    p_end: v.endTime ?? null,
    p_rrule: v.rrule ?? null,
    p_rec_until: v.rrule ? (v.recurrenceUntil ?? null) : null,
  });
  if (error || !occId) return fail(GENERIC);
  const { timezone } = await getUserSettings();
  const [item] = await getItemsByIds([occId], timezone);
  return item ? { ok: true, data: item } : fail(GENERIC);
}

export async function updateOccurrenceAction(
  id: string,
  patch: OccurrencePatch,
): Promise<ActionResult<{ completedAt: string | null; completedOn: string | null; updatedAt: string }>> {
  const parsed = updateOccurrenceSchema.safeParse({ id, patch });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const p = parsed.data.patch;
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);

  const update: TablesUpdate<"task_occurrences"> = {};
  if (p.status !== undefined) update.status = p.status;
  if (p.startTime !== undefined) update.start_time = p.startTime;
  if (p.endTime !== undefined) update.end_time = p.endTime;

  const { data, error } = await a.supabase
    .from("task_occurrences")
    .update(update)
    .eq("id", parsed.data.id)
    .is("moved_to_occurrence_id", null) // rescheduled occurrences are frozen history
    .select("completed_at, completed_on, updated_at")
    .maybeSingle();
  if (error) return fail(error.code === "23514" ? "End time must be after start time." : GENERIC);
  if (!data) return fail("This task can no longer be edited.");
  return { ok: true, data: { completedAt: data.completed_at, completedOn: data.completed_on, updatedAt: data.updated_at } };
}

/** Sets one status on many occurrences (review workflow, bulk bar). Skips moved/foreign rows. */
export async function bulkStatusAction(ids: string[], status: TaskStatus): Promise<ActionResult<{ updated: { id: string; completedAt: string | null; completedOn: string | null }[] }>> {
  const parsed = bulkStatusSchema.safeParse({ ids, status });
  if (!parsed.success) return fail("Select between 1 and 200 tasks.");
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { data, error } = await a.supabase
    .from("task_occurrences")
    .update({ status: parsed.data.status })
    .in("id", parsed.data.ids)
    .is("moved_to_occurrence_id", null)
    .select("id, completed_at, completed_on");
  if (error) return fail(GENERIC);
  return { ok: true, data: { updated: (data ?? []).map((r) => ({ id: r.id, completedAt: r.completed_at, completedOn: r.completed_on })) } };
}

export interface RescheduleResult {
  moves: { oldId: string; newId: string; fromDate: string }[];
  newItems: TaskItem[];
  movedOld: TaskItem[];
}

/**
 * Carry forward / reschedule. Creates NEW occurrences on the destination date and marks the
 * originals as moved; originals keep their date and status. Not-eligible rows (done, already
 * moved, archived, not yours) are skipped by the database and simply absent from `moves`.
 */
export async function rescheduleAction(input: RescheduleInput): Promise<ActionResult<RescheduleResult>> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const v = parsed.data;
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { timezone, today } = await getUserSettings();
  if (v.date < today) return fail("Choose today or a later date.");

  const { data, error } = await a.supabase.rpc("reschedule_occurrences", {
    p_ids: v.ids,
    p_date: v.date,
    p_keep_time: v.keepTime,
    p_start: v.keepTime ? null : (v.startTime ?? null),
    p_end: v.keepTime ? null : (v.endTime ?? null),
    p_reason: v.reason?.trim() || null,
  });
  if (error) return fail(error.code === "22023" ? error.message : GENERIC);

  const moves = (data ?? []).map((m) => ({ oldId: m.old_id, newId: m.new_id, fromDate: m.from_date }));
  const items = await getItemsByIds(moves.flatMap((m) => [m.oldId, m.newId]), timezone);
  const newIds = new Set(moves.map((m) => m.newId));
  return {
    ok: true,
    data: { moves, newItems: items.filter((i) => newIds.has(i.id)), movedOld: items.filter((i) => !newIds.has(i.id)) },
  };
}

/** Reverts recent reschedules when still safe (new occurrence untouched). Reports per id. */
export async function undoRescheduleAction(oldIds: string[]): Promise<ActionResult<{ results: { id: string; ok: boolean }[] }>> {
  if (oldIds.length === 0 || oldIds.length > 200) return fail("Nothing to undo.");
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const results: { id: string; ok: boolean }[] = [];
  for (const id of oldIds) {
    const { data, error } = await a.supabase.rpc("undo_reschedule", { p_old_id: id });
    results.push({ id, ok: !error && data === true });
  }
  return { ok: true, data: { results } };
}

export async function updateTaskAction(taskId: string, patch: TaskPatch): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse({ taskId, patch });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const p = parsed.data.patch;
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);

  const update: TablesUpdate<"tasks"> = {};
  if (p.title !== undefined) update.title = p.title;
  if (p.notes !== undefined) update.notes = p.notes;
  if (p.priority !== undefined) update.priority = p.priority;
  if (p.estimatedMinutes !== undefined) update.estimated_minutes = p.estimatedMinutes;
  if (p.categoryId !== undefined) update.category_id = p.categoryId;
  if (p.goalId !== undefined) update.goal_id = p.goalId;
  if (p.deadline !== undefined) update.deadline_date = p.deadline;
  if (p.archived !== undefined) update.archived_at = p.archived ? new Date().toISOString() : null;

  const { data, error } = await a.supabase.from("tasks").update(update).eq("id", parsed.data.taskId).select("id").maybeSingle();
  if (error) return fail(GENERIC);
  if (!data) return fail("Task not found.");
  return { ok: true, data: undefined };
}

export async function archiveTaskAction(taskId: string, archived: boolean): Promise<ActionResult> {
  return updateTaskAction(taskId, { archived });
}

/** Ends a repeating series from today; removes only untouched future instances. */
export async function stopRecurrenceAction(taskId: string): Promise<ActionResult<{ removed: number }>> {
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { today } = await getUserSettings();
  const { data, error } = await a.supabase.rpc("stop_recurrence", { p_task_id: taskId, p_from: today });
  if (error) return fail(GENERIC);
  return { ok: true, data: { removed: data ?? 0 } };
}

export async function createCategoryAction(name: string): Promise<ActionResult<Category>> {
  const parsed = createCategorySchema.safeParse({ name });
  if (!parsed.success) return fail("Enter a category name (max 60 characters).");
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { data, error } = await a.supabase.from("categories").insert({ name: parsed.data.name }).select("id, name, color").single();
  if (error) return fail(error.code === "23505" ? "That category already exists." : GENERIC);
  return { ok: true, data };
}

/** Records that the user finished (or consciously skipped) today's rollover review. */
export async function markReviewedAction(): Promise<ActionResult> {
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { today } = await getUserSettings();
  const { error } = await a.supabase.from("user_settings").update({ last_review_date: today }).eq("user_id", a.userId);
  return error ? fail(GENERIC) : { ok: true, data: undefined };
}

export async function updateTimezoneAction(timezone: string): Promise<ActionResult<{ today: string }>> {
  const parsed = timezoneSchema.safeParse({ timezone });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Unknown timezone.");
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { error } = await a.supabase.from("user_settings").update({ timezone: parsed.data.timezone }).eq("user_id", a.userId);
  if (error) return fail(error.code === "22023" ? "Unknown timezone." : GENERIC);
  const { todayIn } = await import("@/lib/dates");
  return { ok: true, data: { today: todayIn(parsed.data.timezone) } };
}

export async function updateWorkHoursAction(workStart: string, workEnd: string): Promise<ActionResult> {
  const ok = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!ok.test(workStart) || !ok.test(workEnd) || workEnd <= workStart) return fail("End must be after start.");
  const a = await authed();
  if (!a) return fail(SESSION_ENDED);
  const { error } = await a.supabase.from("user_settings").update({ work_start: workStart, work_end: workEnd }).eq("user_id", a.userId);
  return error ? fail(GENERIC) : { ok: true, data: undefined };
}
