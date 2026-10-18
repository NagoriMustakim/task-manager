import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { addDays } from "@/lib/dates";
import { occurrenceDates, parseRule } from "@/lib/recurrence";

/** Instances are created at most this many days ahead of today (bounded generation). */
export const GENERATION_HORIZON_DAYS = 60;
/** Instances missed while the app wasn't opened are backfilled this far back. */
export const BACKFILL_DAYS = 90;
const MAX_TASKS_PER_PASS = 50;

/**
 * On-demand, idempotent materialisation of recurring instances. Called when task pages load.
 * Only the window (generated_through, today + horizon] is evaluated, each instance is a
 * separate row, and the database's partial unique index makes repeats harmless.
 */
export async function ensureRecurringOccurrences(today: string): Promise<void> {
  const supabase = await createClient();
  const uid = await currentUserId();
  const horizon = addDays(today, GENERATION_HORIZON_DAYS);
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, recurrence_rule, recurrence_start, recurrence_until, recurrence_generated_through")
    .eq("user_id", uid)
    .not("recurrence_rule", "is", null)
    .is("archived_at", null)
    .or(`recurrence_generated_through.is.null,recurrence_generated_through.lt.${horizon}`)
    .limit(MAX_TASKS_PER_PASS);

  await Promise.all(
    (tasks ?? []).map(async (t) => {
      const rule = t.recurrence_rule ? parseRule(t.recurrence_rule) : null;
      if (!rule || !t.recurrence_start) return;
      const backfillFrom = addDays(today, -BACKFILL_DAYS);
      const resume = t.recurrence_generated_through ? addDays(t.recurrence_generated_through, 1) : t.recurrence_start;
      const from = [resume, backfillFrom, t.recurrence_start].reduce((a, b) => (a > b ? a : b));
      const dates = from <= horizon ? occurrenceDates(rule, { start: t.recurrence_start, from, to: horizon, until: t.recurrence_until }) : [];
      await supabase.rpc("materialize_task_occurrences", { p_task_id: t.id, p_dates: dates, p_through: horizon });
    }),
  );
}
