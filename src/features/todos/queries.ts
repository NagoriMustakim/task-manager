import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Todo } from "./types";

const COLUMNS = "id, title, priority, status, scheduled_date, start_time, end_time, created_at";

type Row = { id: string; title: string; priority: Todo["priority"]; status: Todo["status"]; scheduled_date: string; start_time: string | null; end_time: string | null; created_at: string };

export const toTodo = (r: Row): Todo => ({
  id: r.id, title: r.title, priority: r.priority, status: r.status, date: r.scheduled_date,
  start: r.start_time ? r.start_time.slice(0, 5) : null, end: r.end_time ? r.end_time.slice(0, 5) : null, createdAt: r.created_at,
});

export type TodoFilter =
  | { kind: "day"; date: string }
  | { kind: "overdue"; before: string }
  | { kind: "upcoming"; after: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "all"; status?: Todo["status"] | undefined; q?: string | undefined };

export const LIST_LIMIT = 500;

/**
 * One query per page. Always filtered by user_id explicitly: an administrator's row-level policy lets
 * them read everyone's rows, so an unfiltered query would mix users together.
 */
export async function listTodos(filter: TodoFilter, userId: string): Promise<Todo[]> {
  const supabase = await createClient();
  let q = supabase.from("todos").select(COLUMNS).eq("user_id", userId);
  switch (filter.kind) {
    case "day": q = q.eq("scheduled_date", filter.date); break;
    case "overdue": q = q.lt("scheduled_date", filter.before).in("status", ["new", "pending"]); break;
    case "upcoming": q = q.gt("scheduled_date", filter.after); break;
    case "range": q = q.gte("scheduled_date", filter.from).lte("scheduled_date", filter.to); break;
    case "all":
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.q) q = q.ilike("title", `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`);
      break;
  }
  const { data, error } = await q
    .order("scheduled_date", { ascending: filter.kind !== "all" })
    .limit(LIST_LIMIT)
    .returns<Row[]>();
  if (error) throw new Error("Could not load tasks.");
  return (data ?? []).map(toTodo);
}
