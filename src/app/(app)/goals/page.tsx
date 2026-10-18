import type { Metadata } from "next";
import Link from "next/link";
import { GoalCard, GoalForm } from "@/features/goals/goals-client";
import { goalIsPast } from "@/features/goals/period";
import { listGoals } from "@/features/goals/queries";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings } from "@/features/tasks/queries";

export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const history = (await searchParams).view === "history";
  const { today } = await getUserSettings();
  const all = await listGoals(true);
  const goals = all.filter((g) => goalIsPast(g, today) === history);
  const tab = "h-8 rounded-full border border-line-strong px-3 text-xs leading-8 hover:bg-canvas aria-[current=true]:border-accent aria-[current=true]:bg-canvas aria-[current=true]:font-medium";
  return (
    <>
      <PageHeader title="Goals" subtitle="Weekly and monthly goals. Link a task from its details panel." />
      <nav aria-label="Goal view" className="mb-4 flex gap-1.5">
        <Link href="/goals" aria-current={!history} className={tab}>Current</Link>
        <Link href="/goals?view=history" aria-current={history} className={tab}>History</Link>
      </nav>
      {!history ? <GoalForm /> : null}
      {goals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center"><p className="font-medium">{history ? "No past goals yet" : "No goals yet"}</p><p className="mt-1 text-ink-muted">{history ? "Goals move here when completed, archived, or their week or month ends." : "Add one above, then link tasks to it."}</p></div>
      ) : (
        <ul className="space-y-3">{goals.map((g) => (<GoalCard key={g.id} goal={g} today={today} history={history} />))}</ul>
      )}
    </>
  );
}
