"use server";

import { createClient } from "@/lib/supabase/server";
import { createSchema, idSchema, idsSchema, patchSchema, type CreateInput, type Patch } from "./schemas";
import { toTodo } from "./queries";
import type { Todo } from "./types";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const GENERIC = "Something went wrong. Try again.";
const ENDED = "Your session has ended. Sign in again.";

/** Every action runs with the signed-in user's JWT, so row-level security decides what can change. */
async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}

const COLUMNS = "id, title, priority, status, scheduled_date, start_time, end_time, created_at";

export async function createTodoAction(input: CreateInput): Promise<Result<Todo>> {
  const p = createSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  const supabase = await authed();
  if (!supabase) return fail(ENDED);
  const v = p.data;
  const { data, error } = await supabase.from("todos")
    .insert({ title: v.title, priority: v.priority, scheduled_date: v.date, start_time: v.start ?? null, end_time: v.end ?? null })
    .select(COLUMNS).single();
  if (error || !data) return fail(GENERIC);
  return { ok: true, data: toTodo(data) };
}

export async function updateTodoAction(id: string, patch: Patch): Promise<Result> {
  const i = idSchema.safeParse(id);
  const p = patchSchema.safeParse(patch);
  if (!i.success || !p.success) return fail(p.success ? "Invalid task." : (p.error.issues[0]?.message ?? "Invalid input."));
  const supabase = await authed();
  if (!supabase) return fail(ENDED);
  const v = p.data;
  const update: { title?: string; priority?: Patch["priority"] & string; status?: Patch["status"] & string; scheduled_date?: string; start_time?: string | null; end_time?: string | null } = {};
  if (v.title !== undefined) update.title = v.title;
  if (v.priority !== undefined) update.priority = v.priority;
  if (v.status !== undefined) update.status = v.status;
  if (v.date !== undefined) update.scheduled_date = v.date;
  if (v.start !== undefined) update.start_time = v.start;
  if (v.end !== undefined) update.end_time = v.end;
  const { data, error } = await supabase.from("todos").update(update).eq("id", i.data).select("id").maybeSingle();
  if (error) return fail(error.code === "23514" ? "End time must be after start time." : GENERIC);
  return data ? { ok: true, data: undefined } : fail("Task not found.");
}

/** Moves several tasks to one day (e.g. all overdue tasks to today). */
export async function moveTodosAction(ids: string[], date: string): Promise<Result<{ moved: number }>> {
  const p = idsSchema.safeParse(ids);
  const d = patchSchema.safeParse({ date });
  if (!p.success || !d.success) return fail("Invalid request.");
  const supabase = await authed();
  if (!supabase) return fail(ENDED);
  const { data, error } = await supabase.from("todos").update({ scheduled_date: d.data.date! }).in("id", p.data).select("id");
  return error ? fail(GENERIC) : { ok: true, data: { moved: data?.length ?? 0 } };
}

export async function deleteTodoAction(id: string): Promise<Result> {
  const i = idSchema.safeParse(id);
  if (!i.success) return fail("Invalid task.");
  const supabase = await authed();
  if (!supabase) return fail(ENDED);
  const { data, error } = await supabase.from("todos").delete().eq("id", i.data).select("id");
  if (error) return fail(GENERIC);
  return data?.length ? { ok: true, data: undefined } : fail("Task not found.");
}
