"use server";

import { createClient } from "@/lib/supabase/server";
import { addEntrySchema, startSchema, stopSchema, updateEntrySchema, validateEntry } from "./schemas";
import { getActiveTimer, type ActiveTimer } from "./queries";

export interface TimeEntry {
  id: string;
  taskId: string;
  occurrenceId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  note: string | null;
  source: "timer" | "manual";
  editedAt: string | null;
}
export type TimeResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Raw = { id: string; task_id: string; occurrence_id: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; note: string | null; source: "timer" | "manual"; edited_at: string | null };
const toEntry = (r: Raw): TimeEntry => ({
  id: r.id, taskId: r.task_id, occurrenceId: r.occurrence_id, startedAt: r.started_at, endedAt: r.ended_at,
  durationSeconds: r.duration_seconds, note: r.note, source: r.source, editedAt: r.edited_at,
});

/** Maps database errors to short messages; never leaks internals. */
function explain(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23P01": return "That overlaps another time entry.";
    case "23514": return "That entry is longer than 24 hours.";
    case "P0002": return "That task or entry no longer exists.";
    case "42501": return "Your session has ended. Sign in again.";
    case "22023": return error.message.charAt(0).toUpperCase() + error.message.slice(1) + (error.message.endsWith(".") ? "" : ".");
    default: return "Something went wrong. Try again.";
  }
}

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

export async function startTimerAction(occurrenceId: string): Promise<TimeResult<{ started: TimeEntry; stopped: TimeEntry | null; serverNow: string }>> {
  const p = startSchema.safeParse({ occurrenceId });
  if (!p.success) return fail("Invalid task.");
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase.rpc("start_timer", { p_occurrence_id: p.data.occurrenceId });
  if (error) return fail(explain(error));
  const d = data as unknown as { started: Raw; stopped: Raw | null; server_now: string };
  return { ok: true, data: { started: toEntry(d.started), stopped: d.stopped ? toEntry(d.stopped) : null, serverNow: d.server_now } };
}

export async function stopTimerAction(input: { sessionId?: string | null; endedAt?: string | null } = {}): Promise<TimeResult<{ stopped: TimeEntry; serverNow: string }>> {
  const p = stopSchema.safeParse(input);
  if (!p.success) return fail("Invalid request.");
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase.rpc("stop_timer", { p_session_id: p.data.sessionId ?? null, p_ended_at: p.data.endedAt ?? null });
  if (error) return fail(explain(error));
  const d = data as unknown as { stopped: Raw; server_now: string };
  return { ok: true, data: { stopped: toEntry(d.stopped), serverNow: d.server_now } };
}

export async function addTimeEntryAction(input: { occurrenceId: string; startedAt: string; endedAt: string; note?: string | null }): Promise<TimeResult<TimeEntry>> {
  const p = addEntrySchema.safeParse(input);
  if (!p.success) return fail("Check the times you entered.");
  const rule = validateEntry(p.data);
  if (rule) return fail(rule);
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase.rpc("add_time_entry", {
    p_occurrence_id: p.data.occurrenceId, p_started_at: p.data.startedAt, p_ended_at: p.data.endedAt, p_note: p.data.note ?? null,
  });
  return error ? fail(explain(error)) : { ok: true, data: toEntry(data as unknown as Raw) };
}

export async function updateTimeEntryAction(input: { id: string; startedAt: string; endedAt: string | null; note?: string | null }): Promise<TimeResult<TimeEntry>> {
  const p = updateEntrySchema.safeParse({ ...input, endedAt: input.endedAt ?? new Date().toISOString() });
  if (!p.success) return fail("Check the times you entered.");
  if (input.endedAt) {
    const rule = validateEntry({ startedAt: p.data.startedAt, endedAt: p.data.endedAt });
    if (rule) return fail(rule);
  }
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase.rpc("update_time_entry", {
    p_id: p.data.id, p_started_at: p.data.startedAt, p_ended_at: input.endedAt ? p.data.endedAt : null, p_note: p.data.note ?? null,
  });
  return error ? fail(explain(error)) : { ok: true, data: toEntry(data as unknown as Raw) };
}

export async function deleteTimeEntryAction(id: string): Promise<TimeResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Invalid entry.");
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase.from("time_sessions").delete().eq("id", id).select("id"); // RLS: own rows only
  if (error) return fail("Something went wrong. Try again.");
  return data?.length ? { ok: true, data: undefined } : fail("That entry no longer exists.");
}

export async function listTimeEntriesAction(taskId: string): Promise<TimeResult<TimeEntry[]>> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return fail("Invalid task.");
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  const { data, error } = await supabase
    .from("time_sessions")
    .select("id, task_id, occurrence_id, started_at, ended_at, duration_seconds, note, source, edited_at")
    .eq("task_id", taskId)
    .order("started_at", { ascending: false })
    .limit(100);
  return error ? fail("Could not load time entries.") : { ok: true, data: (data ?? []).map((r) => toEntry(r as Raw)) };
}

/** Re-reads the running timer from the database (recovery after reload, sleep, or another device). */
export async function syncTimerAction(): Promise<TimeResult<{ timer: ActiveTimer | null; serverNow: string }>> {
  const supabase = await authed();
  if (!supabase) return fail("Your session has ended. Sign in again.");
  return { ok: true, data: await getActiveTimer() };
}
