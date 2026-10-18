import type { Metadata } from "next";
import { getAiStatus } from "@/features/ai/client";
import { PageHeader } from "@/features/tasks/components/page-header";
import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { getUserToday, listCategories, listGoalOptions, listItems } from "@/features/tasks/queries";
import { addDays } from "@/lib/dates";

export const metadata: Metadata = { title: "Upcoming" };
export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const { today, timezone } = await getUserToday();
  await ensureRecurringOccurrences(today);
  const [goals, items, categories] = await Promise.all([listGoalOptions(), listItems({ kind: "upcoming", after: today }, timezone), listCategories()]);
  return (
    <>
      <PageHeader title="Upcoming" subtitle="Everything scheduled after today" />
      <TaskWorkspace
        aiConfigured={getAiStatus().configured}
        goals={goals}
        initialItems={items}
        categories={categories}
        today={today}
        view={{ mode: "upcoming" }}
        composerDate={addDays(today, 1)}
        emptyTitle="No upcoming tasks"
        emptyHint="Tasks you schedule for future days show up here."
      />
    </>
  );
}
