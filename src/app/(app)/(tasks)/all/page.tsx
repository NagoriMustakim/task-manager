import type { Metadata } from "next";
import Link from "next/link";
import { getAiStatus } from "@/features/ai/client";
import { SearchBox } from "@/features/tasks/components/search-box";
import { PageHeader } from "@/features/tasks/components/page-header";
import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { getUserToday, listCategories, listGoalOptions, listItems } from "@/features/tasks/queries";
import { addDays } from "@/lib/dates";
import { STATUSES, STATUS_LABEL, type TaskStatus } from "@/features/tasks/types";

export const metadata: Metadata = { title: "All Tasks" };
export const dynamic = "force-dynamic";

export default async function AllTasksPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const { today, timezone } = await getUserToday();
  await ensureRecurringOccurrences(today);
  const [goals, items, categories] = await Promise.all([listGoalOptions(), listItems({ kind: "all", status, q, hideRepeatsAfter: addDays(today, 7) }, timezone), listCategories()]);

  const href = (s?: TaskStatus) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/all?${qs}` : "/all";
  };
  const pill = "h-8 rounded-full border border-line-strong px-3.5 text-xs leading-[30px] hover:bg-canvas aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:font-medium aria-[current=true]:text-on-accent";

  return (
    <>
      <PageHeader title="All Tasks" subtitle={`${items.length >= 300 ? "Showing the 300 most recent matches" : `${items.length} ${items.length === 1 ? "entry" : "entries"}`} · repeating tasks shown up to 7 days ahead (see Upcoming for the rest)`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox initial={q ?? ""} status={status} />
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          <Link href={href()} aria-current={!status} className={pill}>All</Link>
          {STATUSES.map((s) => (<Link key={s} href={href(s)} aria-current={status === s} className={pill}>{STATUS_LABEL[s]}</Link>))}
        </nav>
      </div>
      <TaskWorkspace
        aiConfigured={getAiStatus().configured}
        goals={goals}
        key={`${status ?? ""}|${q ?? ""}`}
        initialItems={items}
        categories={categories}
        today={today}
        view={{ mode: "all" }}
        composerDate={today}
        emptyTitle={status || q ? "No tasks match these filters" : "No tasks yet"}
        emptyHint={status || q ? "Clear the filters to see everything." : "Add your first task above, or press N."}
      />
    </>
  );
}
