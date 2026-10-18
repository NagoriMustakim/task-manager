import type { Metadata } from "next";
import { DateNav } from "@/features/tasks/components/date-nav";
import { getAiStatus } from "@/features/ai/client";
import { PageHeader } from "@/features/tasks/components/page-header";
import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import { getUserSettings, listCategories, listGoalOptions, listItems } from "@/features/tasks/queries";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { addDays, formatLongDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Yesterday" };
export const dynamic = "force-dynamic";

export default async function YesterdayPage() {
  const { today, timezone } = await getUserSettings();
  const date = addDays(today, -1);
  await ensureRecurringOccurrences(today);
  const [goals, items, categories] = await Promise.all([listGoalOptions(), listItems({ kind: "day", date }, timezone), listCategories()]);
  return (
    <>
      <PageHeader title="Yesterday" subtitle={`${formatLongDate(date)} · history`} actions={<DateNav date={date} today={today} />} />
      <TaskWorkspace
        aiConfigured={getAiStatus().configured}
        goals={goals}
        initialItems={items}
        categories={categories}
        today={today}
        view={{ mode: "day", date }}
        composerDate={date}
        emptyTitle="Nothing was scheduled yesterday"
        emptyHint="Use the date picker to review any other day."
      />
    </>
  );
}
