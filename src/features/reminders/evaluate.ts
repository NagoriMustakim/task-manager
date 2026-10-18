import { addDays, daysBetween, weekdayOf } from "@/lib/dates";
import { instantToLocal, localToInstant } from "@/lib/time";

/**
 * Decides which reminders are due RIGHT NOW. Pure: takes the clock, the user's timezone and
 * preferences, and a snapshot of open work. Deterministic dedupe keys make the result idempotent:
 * inserting the same reminder twice is a no-op in the database (unique user_id + key).
 */
export interface ReminderPrefs {
  enabled: boolean;
  taskStart: boolean; startLeadMin: number;
  deadline: boolean; deadlineDays: number;
  overdueHigh: boolean;
  morning: boolean; morningTime: string;
  endOfDay: boolean; eodTime: string;
  weekly: boolean; weeklyDay: number; weeklyTime: string;
}

export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: true, taskStart: true, startLeadMin: 10, deadline: true, deadlineDays: 1, overdueHigh: true,
  morning: true, morningTime: "08:30", endOfDay: true, eodTime: "18:00", weekly: true, weeklyDay: 0, weeklyTime: "17:00",
};

export interface OpenOcc { id: string; taskId: string; title: string; priority: string; scheduledDate: string; startTime: string | null }
export interface DeadlineTask { taskId: string; title: string; deadline: string }
export type ReminderKind = "task_start" | "deadline" | "overdue_high" | "morning" | "end_of_day" | "weekly";
export interface Reminder { kind: ReminderKind; dedupeKey: string; title: string; body: string | null; link: string }

/** How long after its trigger time a reminder is still worth showing (avoids stale "morning" alerts at night). */
export const GRACE = { task_start_min: 60, morning_h: 4, eod_h: 5, weekly_h: 8 } as const;
export const MAX_OVERDUE_PER_DAY = 5;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function evaluateReminders(input: {
  now: Date; timeZone: string; prefs: ReminderPrefs; weekStartDay: number;
  todayOpen: OpenOcc[]; overdueHigh: OpenOcc[]; deadlines: DeadlineTask[];
}): Reminder[] {
  const { prefs, timeZone } = input;
  if (!prefs.enabled) return [];
  const local = instantToLocal(input.now, timeZone);
  const today = local.date;
  const nowMin = minutes(local.time);
  const out: Reminder[] = [];

  if (prefs.taskStart) {
    for (const o of input.todayOpen) {
      if (o.scheduledDate !== today || !o.startTime) continue;
      const start = localToInstant(today, o.startTime, timeZone).getTime();
      const diffMin = (start - input.now.getTime()) / 60_000;
      if (diffMin <= prefs.startLeadMin && diffMin >= -GRACE.task_start_min) {
        out.push({
          kind: "task_start", dedupeKey: `start:${o.id}:${today}`,
          title: diffMin > 0 ? `Starting at ${o.startTime}: ${clip(o.title, 80)}` : `Started at ${o.startTime}: ${clip(o.title, 80)}`,
          body: null, link: `/today`,
        });
      }
    }
  }

  if (prefs.deadline) {
    for (const t of input.deadlines) {
      const left = daysBetween(today, t.deadline);
      if (left < 0 || left > prefs.deadlineDays) continue;
      out.push({
        kind: "deadline", dedupeKey: `deadline:${t.taskId}:${t.deadline}:${left === 0 ? "today" : "soon"}`,
        title: left === 0 ? `Due today: ${clip(t.title, 90)}` : `Due ${left === 1 ? "tomorrow" : `in ${left} days`}: ${clip(t.title, 80)}`,
        body: null, link: `/all`,
      });
    }
  }

  if (prefs.overdueHigh) {
    for (const o of input.overdueHigh.filter((x) => x.scheduledDate < today).slice(0, MAX_OVERDUE_PER_DAY)) {
      out.push({ kind: "overdue_high", dedupeKey: `overdue:${o.id}:${today}`, title: `Overdue (${o.priority}): ${clip(o.title, 90)}`, body: `Was scheduled ${o.scheduledDate}.`, link: `/today` });
    }
  }

  const within = (at: string, hours: number) => nowMin >= minutes(at) && nowMin < minutes(at) + hours * 60;
  if (prefs.morning && within(prefs.morningTime, GRACE.morning_h)) {
    out.push({ kind: "morning", dedupeKey: `morning:${today}`, title: "Plan your day", body: "Review today's tasks and set your priorities.", link: "/today" });
  }
  if (prefs.endOfDay && within(prefs.eodTime, GRACE.eod_h)) {
    out.push({ kind: "end_of_day", dedupeKey: `eod:${today}`, title: "End-of-day review", body: "See what's done and decide what carries forward.", link: `/review?date=${today}` });
  }
  if (prefs.weekly && weekdayOf(today) === prefs.weeklyDay && within(prefs.weeklyTime, GRACE.weekly_h)) {
    const weekStart = addDays(today, -((weekdayOf(today) - input.weekStartDay + 7) % 7));
    out.push({ kind: "weekly", dedupeKey: `weekly:${weekStart}`, title: "Weekly review", body: "Look back at the week and plan the next one.", link: `/review/week?start=${weekStart}` });
  }
  return out;
}

export function validatePrefs(p: ReminderPrefs): string | null {
  const t = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (![p.morningTime, p.eodTime, p.weeklyTime].every((x) => t.test(x))) return "Use HH:MM for times.";
  if (!Number.isInteger(p.startLeadMin) || p.startLeadMin < 0 || p.startLeadMin > 240) return "Start reminder lead must be 0–240 minutes.";
  if (!Number.isInteger(p.deadlineDays) || p.deadlineDays < 0 || p.deadlineDays > 14) return "Deadline warning must be 0–14 days.";
  if (!Number.isInteger(p.weeklyDay) || p.weeklyDay < 0 || p.weeklyDay > 6) return "Pick a weekday.";
  return null;
}
