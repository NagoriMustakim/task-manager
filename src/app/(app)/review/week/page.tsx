import type { Metadata } from "next";
import Link from "next/link";
import { getAiStatus } from "@/features/ai/client";
import { WeeklyAssistant } from "@/features/ai/components/narrative";
import { compareReports, overloadedDays, repeatedlyPostponed } from "@/features/analytics/compute";
import { loadReport } from "@/features/analytics/queries";
import { isUnderestimated } from "@/features/analytics/review";
import { listGoals } from "@/features/goals/queries";
import { periodRange, periodStart } from "@/features/goals/period";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings } from "@/features/tasks/queries";
import { estimateReport } from "@/features/time/stats";
import { addDays, isIsoDate } from "@/lib/dates";
import { formatSeconds } from "@/lib/time";

export const metadata: Metadata = { title: "Weekly review" };
export const dynamic = "force-dynamic";

const pts = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)} pts`);
const cnt = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v}`);
const rate = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function WeeklyReviewPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start: param } = await searchParams;
  const { today, timezone, weekStartDay } = await getUserSettings();
  const thisWeek = periodStart("weekly", today, weekStartDay);
  const start = isIsoDate(param) ? periodStart("weekly", param, weekStartDay) : thisWeek;
  const range = periodRange("weekly", start);
  const prevRange = periodRange("weekly", addDays(start, -7));

  const [{ report, sessions, titles }, { report: prev }, goals] = await Promise.all([
    loadReport(range, today, timezone), loadReport(prevRange, today, timezone), listGoals(),
  ]);
  const cmp = compareReports(report, prev);
  const heavy = overloadedDays(report.series);
  const repeat = repeatedlyPostponed(report);
  const under = estimateReport(sessions).filter(isUnderestimated);
  const weekGoals = goals.filter((g) => g.status === "active" && (g.period === null || (g.period === "weekly" && g.periodStart === start) || (g.period === "monthly" && g.periodStart && g.periodStart.slice(0, 7) === start.slice(0, 7))));

  const rows: [string, string, string, string, boolean | null][] = [
    ["Completion rate", rate(cmp.completionRate.current), rate(cmp.completionRate.previous), pts(cmp.completionRate.change), cmp.completionRate.change === null ? null : cmp.completionRate.change >= 0],
    ["On-time rate", rate(cmp.onTimeRate.current), rate(cmp.onTimeRate.previous), pts(cmp.onTimeRate.change), cmp.onTimeRate.change === null ? null : cmp.onTimeRate.change >= 0],
    ["Completed", String(cmp.completed.current), String(cmp.completed.previous), cnt(cmp.completed.change), (cmp.completed.change ?? 0) >= 0],
    ["Scheduled", String(cmp.scheduled.current), String(cmp.scheduled.previous), cnt(cmp.scheduled.change), null],
    ["Carried forward", String(cmp.carriedForward.current), String(cmp.carriedForward.previous), cnt(cmp.carriedForward.change), (cmp.carriedForward.change ?? 0) <= 0],
    ["Recorded time", formatSeconds(cmp.actualSeconds.current ?? 0), formatSeconds(cmp.actualSeconds.previous ?? 0), cmp.actualSeconds.change === null ? "—" : `${cmp.actualSeconds.change >= 0 ? "+" : "−"}${formatSeconds(Math.abs(cmp.actualSeconds.change))}`, null],
  ];

  return (
    <>
      <PageHeader
        title="Weekly review"
        subtitle={`${range.from} – ${range.to} compared with ${prevRange.from} – ${prevRange.to}`}
        actions={
          <nav aria-label="Change week" className="flex gap-1.5 text-[13px]">
            <Link href={`/review/week?start=${addDays(start, -7)}`} className="h-8 rounded-control border border-line-strong px-3 leading-8 hover:bg-canvas">Previous</Link>
            {start < thisWeek ? <Link href={`/review/week?start=${addDays(start, 7)}`} className="h-8 rounded-control border border-line-strong px-3 leading-8 hover:bg-canvas">Next</Link> : null}
          </nav>
        }
      />

      <WeeklyAssistant configured={getAiStatus().configured} start={start} />

      <section aria-labelledby="cmp" className="mb-8">
        <h2 id="cmp" className="mb-2 text-sm font-semibold">This week vs previous week</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line text-xs text-ink-muted"><tr><th className="px-3 py-2 font-medium">Metric</th><th className="px-3 py-2 font-medium">This week</th><th className="px-3 py-2 font-medium">Previous</th><th className="px-3 py-2 font-medium">Change</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map(([label, cur, prv, change, good]) => (
                <tr key={label}><th scope="row" className="px-3 py-2 font-normal">{label}</th><td className="px-3 py-2 tabular-nums">{cur}</td><td className="px-3 py-2 tabular-nums text-ink-muted">{prv}</td><td className={`px-3 py-2 tabular-nums ${good === null ? "" : good ? "text-success" : "text-danger"}`}>{change}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Rates are null (—) when nothing was due. Definitions: docs/analytics.md.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ov">
          <h2 id="ov" className="mb-2 text-sm font-semibold">Overloaded days</h2>
          <p className="mb-2 text-xs text-ink-muted">Over 8h of estimated work, or 10+ scheduled occurrences.</p>
          {heavy.length === 0 ? <p className="text-ink-muted">No overloaded days.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{heavy.map((b) => (<li key={b.key} className="flex justify-between px-4 py-2 text-[13px]"><span>{b.key}</span><span className="text-amber-700">{b.scheduled} tasks · {formatSeconds(b.estimatedSeconds)} planned</span></li>))}</ul>
          )}
        </section>

        <section aria-labelledby="rp">
          <h2 id="rp" className="mb-2 text-sm font-semibold">Repeatedly postponed</h2>
          <p className="mb-2 text-xs text-ink-muted">Carried forward 2+ times this week.</p>
          {repeat.length === 0 ? <p className="text-ink-muted">None.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{repeat.map((p) => (<li key={p.taskId} className="flex justify-between gap-3 px-4 py-2 text-[13px]"><span className="truncate">{titles[p.taskId] ?? "Task"}</span><span className="shrink-0 text-amber-700">{p.count}×</span></li>))}</ul>
          )}
        </section>

        <section aria-labelledby="ue">
          <h2 id="ue" className="mb-2 text-sm font-semibold">Underestimated work</h2>
          <p className="mb-2 text-xs text-ink-muted">Recorded time was at least 125% of the estimate.</p>
          {under.length === 0 ? <p className="text-ink-muted">None.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{under.map((u) => (<li key={u.taskId} className="flex justify-between gap-3 px-4 py-2 text-[13px]"><span className="truncate">{u.title}</span><span className="shrink-0 text-amber-700">{formatSeconds(u.actualSeconds)} vs {formatSeconds(u.estimateSeconds * Math.max(1, u.trackedOccurrences))}</span></li>))}</ul>
          )}
        </section>

        <section aria-labelledby="gp">
          <h2 id="gp" className="mb-2 text-sm font-semibold">Goal progress</h2>
          {weekGoals.length === 0 ? <p className="text-ink-muted">No active goals for this week. <Link href="/goals" className="text-accent hover:underline">Add one</Link>.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {weekGoals.map((g) => (<li key={g.id} className="px-4 py-2 text-[13px]"><div className="flex justify-between gap-3"><span className="truncate">{g.title}</span><span className="shrink-0 tabular-nums text-ink-muted">{g.progress.percent === null ? "—" : `${g.progress.percent}%`}</span></div></li>))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
