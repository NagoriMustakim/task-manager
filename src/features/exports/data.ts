import "server-only";
import { fetchAll, loadReport } from "@/features/analytics/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { instantToLocal, startOfLocalDay } from "@/lib/time";
import type { Cell, ExportKind } from "./csv";
import { DAILY_COLUMNS, WEEKLY_COLUMNS, dailyRows, weeklyRows } from "./reports";
import { MAX_EXPORT_ROWS } from "./range";

export interface ExportResult { columns: string[]; rows: Cell[][] }
export class TooManyRows extends Error {}

const local = (iso: string | null, tz: string) => { if (!iso) return ""; const l = instantToLocal(iso, tz); return `${l.date} ${l.time}`; };
const trim = (t: string | null) => (t ? t.slice(0, 5) : "");
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const guardRows = <T,>(rows: T[]) => { if (rows.length > MAX_EXPORT_ROWS) throw new TooManyRows(); return rows; };

/**
 * Builds the rows for one export. Everything is filtered by `subjectId` explicitly and runs under the
 * caller's JWT, so row-level security applies on top (an administrator reads another user only with a grant).
 */
export async function buildExport(kind: ExportKind, range: { from: string; to: string }, subjectId: string, ctx: { timezone: string; today: string; weekStartDay: number }): Promise<ExportResult> {
  const supabase = await createClient();
  const tz = ctx.timezone;
  const start = startOfLocalDay(range.from, tz).toISOString();
  const end = startOfLocalDay(addDays(range.to, 1), tz).toISOString();

  const names = async (table: "tasks" | "categories", ids: string[], col: "title" | "name") => {
    const map = new Map<string, string>();
    for (const part of chunks([...new Set(ids)], 100)) {
      const { data } = await supabase.from(table).select(`id, ${col}`).eq("user_id", subjectId).in("id", part);
      for (const r of (data ?? []) as unknown as Record<string, string>[]) map.set(r.id!, r[col]!);
    }
    return map;
  };

  switch (kind) {
    case "tasks": {
      const rows = guardRows(await fetchAll<{ id: string; title: string; notes: string | null; priority: string; category_id: string | null; deadline_date: string | null; estimated_minutes: number | null; recurrence_rule: string | null; archived_at: string | null; created_at: string }>((a, b) =>
        supabase.from("tasks").select("id, title, notes, priority, category_id, deadline_date, estimated_minutes, recurrence_rule, archived_at, created_at").eq("user_id", subjectId).gte("created_at", start).lt("created_at", end).order("created_at").range(a, b)));
      const cats = await names("categories", rows.flatMap((r) => (r.category_id ? [r.category_id] : [])), "name");
      return {
        columns: ["task_id", "title", "description", "priority", "category", "deadline", "estimate_minutes", "repeat_rule", "created", "archived"],
        rows: rows.map((r) => [r.id, r.title, r.notes, r.priority, r.category_id ? cats.get(r.category_id) : "", r.deadline_date, r.estimated_minutes, r.recurrence_rule, local(r.created_at, tz), r.archived_at ? "yes" : "no"]),
      };
    }
    case "occurrences": {
      type Row = { id: string; task_id: string; original_date: string; scheduled_date: string; start_time: string | null; end_time: string | null; status: string; completed_on: string | null; completed_at: string | null; moved_to_occurrence_id: string | null; moved_at: string | null; moved_reason: string | null; tasks: { title: string; priority: string; category_id: string | null; estimated_minutes: number | null } };
      const rows = guardRows(await fetchAll<Row>((a, b) =>
        supabase.from("task_occurrences").select("id, task_id, original_date, scheduled_date, start_time, end_time, status, completed_on, completed_at, moved_to_occurrence_id, moved_at, moved_reason, tasks!inner(title, priority, category_id, estimated_minutes)").eq("user_id", subjectId).gte("scheduled_date", range.from).lte("scheduled_date", range.to).order("scheduled_date").order("id").range(a, b).returns<Row[]>()));
      const cats = await names("categories", rows.flatMap((r) => (r.tasks.category_id ? [r.tasks.category_id] : [])), "name");
      const dest = new Map<string, string>();
      for (const part of chunks(rows.flatMap((r) => (r.moved_to_occurrence_id ? [r.moved_to_occurrence_id] : [])), 100)) {
        const { data } = await supabase.from("task_occurrences").select("id, scheduled_date").eq("user_id", subjectId).in("id", part);
        for (const d of data ?? []) dest.set(d.id, d.scheduled_date);
      }
      const secs = new Map<string, number>();
      for (const part of chunks(rows.map((r) => r.id), 100)) {
        const { data } = await supabase.from("time_sessions").select("occurrence_id, duration_seconds").eq("user_id", subjectId).in("occurrence_id", part).not("ended_at", "is", null);
        for (const s of data ?? []) if (s.occurrence_id) secs.set(s.occurrence_id, (secs.get(s.occurrence_id) ?? 0) + (s.duration_seconds ?? 0));
      }
      return {
        columns: ["occurrence_id", "task_id", "title", "priority", "category", "original_date", "scheduled_date", "start_time", "end_time", "status", "completed_on", "completed_at", "moved_to_date", "moved_at", "move_reason", "estimate_minutes", "recorded_minutes"],
        rows: rows.map((r) => [r.id, r.task_id, r.tasks.title, r.tasks.priority, r.tasks.category_id ? cats.get(r.tasks.category_id) : "", r.original_date, r.scheduled_date, trim(r.start_time), trim(r.end_time), r.status, r.completed_on, local(r.completed_at, tz), r.moved_to_occurrence_id ? (dest.get(r.moved_to_occurrence_id) ?? "") : "", local(r.moved_at, tz), r.moved_reason, r.tasks.estimated_minutes, Math.round(((secs.get(r.id) ?? 0) / 60) * 10) / 10]),
      };
    }
    case "history": {
      type Ev = { task_id: string; event_type: string; from_status: string | null; to_status: string | null; from_date: string | null; to_date: string | null; from_priority: string | null; to_priority: string | null; reason: string | null; created_at: string };
      const rows = guardRows(await fetchAll<Ev>((a, b) =>
        supabase.from("task_events").select("task_id, event_type, from_status, to_status, from_date, to_date, from_priority, to_priority, reason, created_at").eq("user_id", subjectId).gte("created_at", start).lt("created_at", end).order("created_at").order("id").range(a, b)));
      const titles = await names("tasks", rows.map((r) => r.task_id), "title");
      return {
        columns: ["time", "task", "event", "from_status", "to_status", "from_date", "to_date", "from_priority", "to_priority", "reason"],
        rows: rows.map((r) => [local(r.created_at, tz), titles.get(r.task_id) ?? "", r.event_type, r.from_status, r.to_status, r.from_date, r.to_date, r.from_priority, r.to_priority, r.reason]),
      };
    }
    case "time": {
      type S = { task_id: string; started_at: string; ended_at: string | null; duration_seconds: number | null; source: string; note: string | null; edited_at: string | null };
      const rows = guardRows(await fetchAll<S>((a, b) =>
        supabase.from("time_sessions").select("task_id, started_at, ended_at, duration_seconds, source, note, edited_at").eq("user_id", subjectId).lt("started_at", end).or(`ended_at.is.null,ended_at.gte.${start}`).order("started_at").range(a, b)));
      const titles = await names("tasks", rows.map((r) => r.task_id), "title");
      return {
        columns: ["task", "started", "ended", "duration_minutes", "source", "note", "edited"],
        rows: rows.map((r) => [titles.get(r.task_id) ?? "", local(r.started_at, tz), r.ended_at ? local(r.ended_at, tz) : "running", r.duration_seconds === null ? "" : Math.round((r.duration_seconds / 60) * 10) / 10, r.source, r.note, r.edited_at ? "yes" : "no"]),
      };
    }
    case "daily":
    case "weekly": {
      const { report } = await loadReport(range, ctx.today, tz, subjectId, "day");
      return kind === "daily" ? { columns: DAILY_COLUMNS, rows: dailyRows(report.series) } : { columns: WEEKLY_COLUMNS, rows: weeklyRows(report.series, ctx.weekStartDay) };
    }
  }
}
