import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { addDays } from "@/lib/dates";
import { startOfLocalDay } from "@/lib/time";
import type { ClosedSession } from "./stats";

export interface ActiveTimer {
  sessionId: string;
  taskId: string;
  occurrenceId: string | null;
  title: string;
  startedAt: string;
}

/** The user's single running session, if any. Elapsed time is derived from `startedAt`. */
export async function getActiveTimer(userId?: string): Promise<{ timer: ActiveTimer | null; serverNow: string }> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const { data } = await supabase
    .from("time_sessions")
    .select("id, task_id, occurrence_id, started_at, tasks!inner(title)")
    .eq("user_id", uid)
    .is("ended_at", null)
    .maybeSingle();
  const serverNow = new Date().toISOString();
  if (!data) return { timer: null, serverNow };
  const title = (data.tasks as unknown as { title: string }).title;
  return { timer: { sessionId: data.id, taskId: data.task_id, occurrenceId: data.occurrence_id, title, startedAt: data.started_at }, serverNow };
}

/** Finished sessions ending on/after the start of `fromDate` (local). Paged: the API caps rows per request. */
export async function listClosedSessions(fromDate: string, timeZone: string, toDate?: string, userId?: string): Promise<ClosedSession[]> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const since = startOfLocalDay(fromDate, timeZone).toISOString();
  const until = toDate ? startOfLocalDay(addDays(toDate, 1), timeZone).toISOString() : null;
  const out: ClosedSession[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 20; page++) {
    let q = supabase
      .from("time_sessions")
      .select("task_id, occurrence_id, started_at, ended_at, tasks!inner(title, category_id, estimated_minutes)")
      .eq("user_id", uid)
      .not("ended_at", "is", null)
      .gte("ended_at", since);
    if (until) q = q.lt("started_at", until);
    const { data, error } = await q
      .order("started_at")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error("Could not load time data.");
    for (const r of data ?? []) {
      const t = r.tasks as unknown as { title: string; category_id: string | null; estimated_minutes: number | null };
      out.push({ taskId: r.task_id, occurrenceId: r.occurrence_id, categoryId: t.category_id, taskTitle: t.title, estimatedMinutes: t.estimated_minutes, startedAt: r.started_at, endedAt: r.ended_at! });
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}
