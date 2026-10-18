"use server";

import { z } from "zod";
import { isUnfinished } from "@/features/tasks/metrics";
import { getUserSettings, listItems } from "@/features/tasks/queries";
import { addDays, todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { evaluateReminders, validatePrefs, type DeadlineTask, type OpenOcc, type ReminderPrefs } from "./evaluate";
import { getReminderPrefs } from "./queries";

export interface NotificationDTO { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const GENERIC = "Something went wrong. Try again.";

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

async function inbox(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [list, unread] = await Promise.all([
    supabase.from("notifications").select("id, kind, title, body, link, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  const items: NotificationDTO[] = (list.data ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: n.created_at, read: n.read_at !== null }));
  return { items, unread: unread.count ?? 0 };
}

/**
 * Called by the open app (about once a minute while visible). Evaluates which reminders are due now,
 * stores new ones idempotently (unique user + dedupe key), and returns the inbox. A reminder is only
 * "delivered" when the person sees it in the app: there is no background delivery.
 */
export async function syncRemindersAction(): Promise<Result<{ items: NotificationDTO[]; unread: number; created: string[] }>> {
  const a = await authed();
  if (!a) return fail("Your session has ended.");
  try {
    const { supabase, userId } = a;
    const prefs = await getReminderPrefs(userId);
    const settings = await getUserSettings(userId);
    const now = new Date();
    let created: string[] = [];

    if (prefs.enabled) {
      const today = todayIn(settings.timezone, now);
      const [dayItems, overdue] = await Promise.all([
        prefs.taskStart ? listItems({ kind: "day", date: today }, settings.timezone, 300, userId) : Promise.resolve([]),
        prefs.overdueHigh ? listItems({ kind: "overdue", before: today }, settings.timezone, 100, userId) : Promise.resolve([]),
      ]);
      const toOcc = (i: (typeof dayItems)[number]): OpenOcc => ({ id: i.id, taskId: i.taskId, title: i.title, priority: i.priority, scheduledDate: i.scheduledDate, startTime: i.startTime });

      let deadlines: DeadlineTask[] = [];
      if (prefs.deadline) {
        const { data: tasks } = await supabase.from("tasks").select("id, title, deadline_date").eq("user_id", userId).is("archived_at", null)
          .gte("deadline_date", today).lte("deadline_date", addDays(today, prefs.deadlineDays)).limit(100);
        const ids = (tasks ?? []).map((t) => t.id);
        if (ids.length) {
          const { data: open } = await supabase.from("task_occurrences").select("task_id").eq("user_id", userId).in("task_id", ids).in("status", ["new", "pending"]).is("moved_to_occurrence_id", null);
          const openIds = new Set((open ?? []).map((o) => o.task_id));
          deadlines = (tasks ?? []).filter((t) => openIds.has(t.id) && t.deadline_date).map((t) => ({ taskId: t.id, title: t.title, deadline: t.deadline_date! }));
        }
      }

      const due = evaluateReminders({
        now, timeZone: settings.timezone, prefs, weekStartDay: settings.weekStartDay,
        todayOpen: dayItems.filter(isUnfinished).map(toOcc),
        overdueHigh: overdue.filter((i) => i.priority === "high" || i.priority === "urgent").map(toOcc),
        deadlines,
      });
      if (due.length) {
        const { data } = await supabase.from("notifications")
          .upsert(due.map((r) => ({ kind: r.kind, dedupe_key: r.dedupeKey, title: r.title, body: r.body, link: r.link })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
          .select("id");
        created = (data ?? []).map((r) => r.id);
      }
    }

    // Keep the inbox small: drop entries older than 30 days.
    await supabase.from("notifications").delete().eq("user_id", userId).lt("created_at", new Date(now.getTime() - 30 * 86_400_000).toISOString());
    return { ok: true, data: { ...(await inbox(supabase, userId)), created } };
  } catch {
    return fail(GENERIC);
  }
}

export async function markNotificationsReadAction(ids?: string[]): Promise<Result<undefined>> {
  const a = await authed();
  if (!a) return fail("Your session has ended.");
  const parsed = z.array(z.string().uuid()).max(100).optional().safeParse(ids);
  if (!parsed.success) return fail("Invalid request.");
  let q = a.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", a.userId).is("read_at", null);
  if (parsed.data) q = q.in("id", parsed.data);
  const { error } = await q;
  return error ? fail(GENERIC) : { ok: true, data: undefined };
}

export async function clearNotificationsAction(): Promise<Result<undefined>> {
  const a = await authed();
  if (!a) return fail("Your session has ended.");
  const { error } = await a.supabase.from("notifications").delete().eq("user_id", a.userId);
  return error ? fail(GENERIC) : { ok: true, data: undefined };
}

export async function updateReminderPrefsAction(p: ReminderPrefs): Promise<Result<undefined>> {
  const a = await authed();
  if (!a) return fail("Your session has ended.");
  const bad = validatePrefs(p);
  if (bad) return fail(bad);
  const { error } = await a.supabase.from("user_settings").update({
    reminders_enabled: Boolean(p.enabled), remind_task_start: Boolean(p.taskStart), remind_start_lead_min: p.startLeadMin,
    remind_deadline: Boolean(p.deadline), remind_deadline_days: p.deadlineDays, remind_overdue_high: Boolean(p.overdueHigh),
    remind_morning: Boolean(p.morning), morning_time: p.morningTime, remind_eod: Boolean(p.endOfDay), eod_time: p.eodTime,
    remind_weekly: Boolean(p.weekly), weekly_day: p.weeklyDay, weekly_time: p.weeklyTime,
  }).eq("user_id", a.userId);
  return error ? fail(GENERIC) : { ok: true, data: undefined };
}
