import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { addDays } from "@/lib/dates";
import { startOfLocalDay } from "@/lib/time";
import type { DateRange } from "@/lib/ranges";
import { listClosedSessions } from "@/features/time/queries";
import type { ClosedSession } from "@/features/time/stats";
import type { Granularity } from "./ranges";
import { computeReport, type EventFact, type OccFact, type Priority, type Report } from "./compute";

const PAGE = 1000;
const MAX_PAGES = 30;

/** PostgREST caps rows per request, so aggregate inputs are fetched in pages (server-side only). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error("Could not load analytics data.");
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

type Row = {
  id: string; task_id: string; original_date: string; scheduled_date: string; status: OccFact["status"];
  completed_on: string | null; completed_at: string | null; moved_to_occurrence_id: string | null;
  tasks: { priority: Priority; category_id: string | null; estimated_minutes: number | null };
};
const COLS = "id, task_id, original_date, scheduled_date, status, completed_on, completed_at, moved_to_occurrence_id, tasks!inner(priority, category_id, estimated_minutes)";
const toFact = (r: Row): OccFact => ({
  id: r.id, taskId: r.task_id, originalDate: r.original_date, scheduledDate: r.scheduled_date, status: r.status,
  completedOn: r.completed_on, completedAt: r.completed_at, moved: r.moved_to_occurrence_id !== null,
  priority: r.tasks.priority, categoryId: r.tasks.category_id, estimatedMinutes: r.tasks.estimated_minutes,
});

export interface LoadedReport { report: Report; sessions: ClosedSession[]; titles: Record<string, string>; scheduled: OccFact[] }

/**
 * Loads only the rows needed for one period (scheduled in it, completed in it, events in it,
 * sessions in it) and aggregates on the server. The browser receives the aggregated Report.
 * Archived tasks are excluded from occurrence metrics (archiving removes a task from view).
 */
export async function loadReport(range: DateRange, today: string, timeZone: string, userId?: string, granularity?: Granularity): Promise<LoadedReport> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const start = startOfLocalDay(range.from, timeZone).toISOString();
  const end = startOfLocalDay(addDays(range.to, 1), timeZone).toISOString();

  const [scheduled, completed, events, sessions, created] = await Promise.all([
    fetchAll<Row>((a, b) => supabase.from("task_occurrences").select(COLS).eq("user_id", uid).is("tasks.archived_at", null).gte("scheduled_date", range.from).lte("scheduled_date", range.to).order("id").range(a, b).returns<Row[]>()),
    fetchAll<Row>((a, b) => supabase.from("task_occurrences").select(COLS).eq("user_id", uid).is("tasks.archived_at", null).eq("status", "done").gte("completed_on", range.from).lte("completed_on", range.to).order("id").range(a, b).returns<Row[]>()),
    fetchAll<{ task_id: string; event_type: string; created_at: string }>((a, b) => supabase.from("task_events").select("task_id, event_type, created_at").eq("user_id", uid).in("event_type", ["rescheduled", "reschedule_undone"]).gte("created_at", start).lt("created_at", end).order("created_at").range(a, b)),
    listClosedSessions(range.from, timeZone, range.to, uid),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", start).lt("created_at", end),
  ]);

  const eventFacts: EventFact[] = events.map((e) => ({ taskId: e.task_id, type: e.event_type as EventFact["type"], createdAt: e.created_at }));
  const scheduledFacts = scheduled.map(toFact);
  const report = computeReport({
    range, today, timeZone, scheduled: scheduledFacts, completed: completed.map(toFact),
    tasksCreated: created.count ?? 0, events: eventFacts, sessions, ...(granularity ? { granularity } : {}),
  });

  const ids = [...new Set(report.postponed.map((p) => p.taskId))].slice(0, 100);
  const titles: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("tasks").select("id, title").eq("user_id", uid).in("id", ids);
    for (const t of data ?? []) titles[t.id] = t.title;
  }
  return { report, sessions, titles, scheduled: scheduledFacts };
}
