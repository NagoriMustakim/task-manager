import type { Metadata } from "next";
import { DateNav } from "@/features/tasks/components/date-nav";
import { getAiStatus } from "@/features/ai/client";
import { PageHeader } from "@/features/tasks/components/page-header";
import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import { getUserSettings, listCategories, listGoalOptions, listItems } from "@/features/tasks/queries";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { formatLongDate, isIsoDate, relativeDateLabel } from "@/lib/dates";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: param } = await searchParams;
  const { today, timezone, lastReviewDate } = await getUserSettings();
  const date = isIsoDate(param) ? param : today;
  await ensureRecurringOccurrences(today);

  const [goals, items, overdue, categories] = await Promise.all([
    listGoalOptions(),
    listItems({ kind: "day", date }, timezone),
    date === today ? listItems({ kind: "overdue", before: today }, timezone) : Promise.resolve([]),
    listCategories(),
  ]);
  const merged = [...overdue, ...items.filter((i) => !overdue.some((o) => o.id === i.id))];
  const past = date < today;

  return (
    <>
      <PageHeader
        title={relativeDateLabel(date, today)}
        subtitle={past ? `${formatLongDate(date)} · history` : formatLongDate(date)}
        actions={<DateNav date={date} today={today} />}
      />
      <TaskWorkspace
        aiConfigured={getAiStatus().configured}
        goals={goals}
        key={date}
        initialItems={merged}
        categories={categories}
        today={today}
        lastReviewDate={lastReviewDate}
        view={{ mode: "day", date }}
        composerDate={date}
        emptyTitle={past ? "Nothing was scheduled on this day" : date === today ? "Nothing planned for today" : "Nothing planned for this day"}
        emptyHint={past ? "Tasks you add here are recorded against this past date." : "Add a task above, or press N."}
      />
    </>
  );
}
