import type { Metadata } from "next";
import Link from "next/link";
import { getAiStatus } from "@/features/ai/client";
import { EndOfDayAssistant } from "@/features/ai/components/narrative";
import { ReviewActions } from "@/features/analytics/components/review-actions";
import { loadReport } from "@/features/analytics/queries";
import { highPriorityUnfinished } from "@/features/analytics/review";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings, listItems } from "@/features/tasks/queries";
import { isUnfinished } from "@/features/tasks/metrics";
import { ensureRecurringOccurrences } from "@/features/tasks/recurrence-service";
import { addDays, formatLongDate, isIsoDate } from "@/lib/dates";
import { formatSeconds } from "@/lib/time";

export const metadata: Metadata = { title: "Daily review" };
export const dynamic = "force-dynamic";

export default async function DailyReviewPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: param } = await searchParams;
  const { today, timezone } = await getUserSettings();
  const date = isIsoDate(param) && param <= today ? param : today;
  await ensureRecurringOccurrences(today);

  const [dayItems, doneItems, overdue, { report }] = await Promise.all([
    listItems({ kind: "day", date }, timezone),
    listItems({ kind: "completedOn", date }, timezone),
    date === today ? listItems({ kind: "overdue", before: today }, timezone) : Promise.resolve([]),
    loadReport({ from: date, to: date }, today, timezone),
  ]);
  const unfinished = [...overdue, ...dayItems.filter((i) => !overdue.some((o) => o.id === i.id))].filter(isUnfinished);
  const planned = dayItems.filter((i) => !i.movedToId);
  const high = highPriorityUnfinished(unfinished);
  const s = report.summary;
  const card = "rounded-lg border border-line bg-surface px-3 py-2.5";

  return (
    <>
      <PageHeader
        title="Daily review"
        subtitle={formatLongDate(date)}
        actions={
          <nav aria-label="Change day" className="flex gap-1.5 text-[13px]">
            <Link href={`/review?date=${addDays(date, -1)}`} className="h-8 rounded-control border border-line-strong px-3 leading-8 hover:bg-canvas">Previous</Link>
            {date < today ? <Link href={`/review?date=${addDays(date, 1)}`} className="h-8 rounded-control border border-line-strong px-3 leading-8 hover:bg-canvas">Next</Link> : null}
          </nav>
        }
      />

      <EndOfDayAssistant configured={getAiStatus().configured} date={date} />

      <dl className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className={card}><dt className="text-xs text-ink-muted">Planned</dt><dd className="text-lg font-semibold tabular-nums">{planned.length}</dd><dd className="text-[11px] text-ink-muted">{s.movedCount} moved away</dd></div>
        <div className={card}><dt className="text-xs text-ink-muted">Completed</dt><dd className="text-lg font-semibold tabular-nums">{doneItems.length}</dd><dd className="text-[11px] text-ink-muted">{s.completionRate === null ? "Nothing due" : `${Math.round(s.completionRate * 100)}% of due work`}</dd></div>
        <div className={card}><dt className="text-xs text-ink-muted">Unfinished</dt><dd className="text-lg font-semibold tabular-nums">{unfinished.length}</dd><dd className="text-[11px] text-ink-muted">{high.length} high priority</dd></div>
        <div className={card}><dt className="text-xs text-ink-muted">Time: planned vs recorded</dt><dd className="text-lg font-semibold tabular-nums">{formatSeconds(s.estimatedSeconds)} / {formatSeconds(s.actualSeconds)}</dd><dd className="text-[11px] text-ink-muted">Estimates vs finished entries</dd></div>
      </dl>

      {high.length ? (
        <section aria-labelledby="hp" className="mb-6">
          <h2 id="hp" className="mb-2 text-sm font-semibold text-danger">High-priority tasks not completed</h2>
          <ul className="divide-y divide-line rounded-lg border border-danger/30 bg-danger-bg">
            {high.map((i) => (<li key={i.id} className="flex justify-between gap-3 px-4 py-2 text-[13px]"><span className="truncate">{i.title}</span><span className="shrink-0 text-danger">{i.priority}</span></li>))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="un" className="mb-6">
        <h2 id="un" className="mb-1 text-sm font-semibold">Remaining: choose what happens next</h2>
        <p className="mb-2 text-xs text-ink-muted">Suggested tasks are pre-selected: high priority, deadline within 2 days, or in progress. Nothing changes until you press a button.</p>
        <ReviewActions key={date + unfinished.length} items={unfinished} today={today} asOf={date} />
      </section>

      <section aria-labelledby="done">
        <h2 id="done" className="mb-2 text-sm font-semibold">Completed this day</h2>
        {doneItems.length === 0 ? <p className="text-ink-muted">Nothing was completed on this day.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {doneItems.map((i) => (<li key={i.id} className="flex justify-between gap-3 px-4 py-2 text-[13px]"><span className="truncate">{i.title}</span><span className="shrink-0 text-xs text-ink-muted">{i.scheduledDate < date ? `planned ${i.scheduledDate}` : i.scheduledDate > date ? `planned ${i.scheduledDate} (early)` : "on schedule"}</span></li>))}
          </ul>
        )}
      </section>
    </>
  );
}
