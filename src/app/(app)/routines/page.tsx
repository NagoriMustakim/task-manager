import type { Metadata } from "next";
import { ReviewActions } from "@/features/analytics/components/review-actions";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings, listItems } from "@/features/tasks/queries";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { RoutineEditor } from "@/features/routines/routine-editor";
import { summarise, type ChipState } from "@/features/routines/logic";
import { currentUserId } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatShortDate } from "@/lib/dates";
import { describeRule } from "@/lib/recurrence";

export const metadata: Metadata = { title: "Routines" };
export const dynamic = "force-dynamic";

const CHIP: Record<ChipState, string> = {
  done: "bg-success", incomplete: "bg-danger", missed: "bg-pri-high", moved: "bg-line-strong", upcoming: "bg-line", today: "bg-accent",
};
const LABEL: Record<ChipState, string> = { done: "done", incomplete: "marked incomplete", missed: "missed (still open)", moved: "moved to another date", upcoming: "upcoming", today: "today" };

export default async function RoutinesPage() {
  const uid = await currentUserId();
  const { today, timezone } = await getUserSettings(uid);
  await ensureRecurringOccurrences(today);
  const supabase = await createClient();

  const { data: tasks } = await supabase.from("tasks").select("id, title, priority, recurrence_rule, recurrence_start, recurrence_until, recurrence_start_time, recurrence_end_time")
    .eq("user_id", uid).not("recurrence_rule", "is", null).is("archived_at", null).order("created_at").limit(100);
  const ids = (tasks ?? []).map((t) => t.id);
  const { data: occ } = ids.length
    ? await supabase.from("task_occurrences").select("id, task_id, scheduled_date, status, moved_to_occurrence_id").eq("user_id", uid).in("task_id", ids).gte("scheduled_date", addDays(today, -30)).lte("scheduled_date", addDays(today, 14)).limit(3000)
    : { data: [] };
  const missed = (await listItems({ kind: "overdue", before: today }, timezone, 200, uid)).filter((i) => i.recurrenceRule);

  return (
    <>
      <PageHeader title="Routines" subtitle="Repeating tasks. Every occurrence has its own status and history." />

      <section aria-labelledby="missed" className="mb-8">
        <h2 id="missed" className="mb-1 text-sm font-semibold">Missed occurrences</h2>
        <p className="mb-2 text-xs text-ink-muted">Past occurrences that are still open. Mark them done, move them, or mark them incomplete.</p>
        {missed.length === 0 ? <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-ink-muted">No missed occurrences.</p> : <ReviewActions items={missed} today={today} asOf={today} />}
      </section>

      <h2 className="mb-2 text-sm font-semibold">Your routines</h2>
      {!tasks?.length ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center"><p className="font-medium">No routines yet</p><p className="mt-1 text-ink-muted">Add a task with “Repeat” in the quick-add options.</p></div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => {
            const s = summarise((occ ?? []).filter((o) => o.task_id === t.id).map((o) => ({ id: o.id, scheduledDate: o.scheduled_date, status: o.status, moved: o.moved_to_occurrence_id !== null })), today);
            return (
              <li key={t.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold">{t.title}</h3>
                  <p className="text-xs text-ink-muted">{describeRule(t.recurrence_rule ?? "")}{t.recurrence_start_time ? ` · ${t.recurrence_start_time.slice(0, 5)}` : ""}{t.recurrence_until ? ` · until ${t.recurrence_until}` : ""}</p>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Last 30 days: {s.done} done, {s.missed} missed, {s.incomplete} incomplete{s.moved ? `, ${s.moved} moved` : ""}.{s.nextDate ? ` Next: ${formatShortDate(s.nextDate)}.` : ""}</p>
                <ul className="mt-2 flex flex-wrap gap-1" aria-label="Recent and upcoming occurrences">
                  {s.states.map((x) => (<li key={x.id} title={`${formatShortDate(x.scheduledDate)}: ${LABEL[x.state]}`} className={`size-3 rounded-sm ${CHIP[x.state]}`}><span className="sr-only">{formatShortDate(x.scheduledDate)}: {LABEL[x.state]}</span></li>))}
                </ul>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium">Change schedule</summary>
                  <RoutineEditor taskId={t.id} today={today} startTime={t.recurrence_start_time?.slice(0, 5) ?? null} endTime={t.recurrence_end_time?.slice(0, 5) ?? null} />
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
