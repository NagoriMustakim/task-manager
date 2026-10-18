import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/scope";
import { DEFAULT_PREFS, type ReminderPrefs } from "./evaluate";

const t = (v: string | null | undefined, d: string) => (v ?? d).slice(0, 5);

export async function getReminderPrefs(userId?: string): Promise<ReminderPrefs> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  const { data } = await supabase.from("user_settings")
    .select("reminders_enabled, remind_task_start, remind_start_lead_min, remind_deadline, remind_deadline_days, remind_overdue_high, remind_morning, morning_time, remind_eod, eod_time, remind_weekly, weekly_day, weekly_time")
    .eq("user_id", uid).maybeSingle();
  if (!data) return DEFAULT_PREFS;
  return {
    enabled: data.reminders_enabled, taskStart: data.remind_task_start, startLeadMin: data.remind_start_lead_min,
    deadline: data.remind_deadline, deadlineDays: data.remind_deadline_days, overdueHigh: data.remind_overdue_high,
    morning: data.remind_morning, morningTime: t(data.morning_time, "08:30"), endOfDay: data.remind_eod, eodTime: t(data.eod_time, "18:00"),
    weekly: data.remind_weekly, weeklyDay: data.weekly_day, weeklyTime: t(data.weekly_time, "17:00"),
  };
}
