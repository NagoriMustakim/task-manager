import type { Metadata } from "next";
import { getAiStatus } from "@/features/ai/client";
import { InsightsAssistant } from "@/features/ai/components/narrative";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings, listCategories } from "@/features/tasks/queries";
import { AnalyticsCharts } from "@/features/analytics/components/charts";
import { MetricCards } from "@/features/analytics/components/metric-cards";
import { RangeFilter } from "@/features/analytics/components/range-filter";
import { loadReport } from "@/features/analytics/queries";
import { PRESET_LABEL, parsePreset, resolveRange } from "@/features/analytics/ranges";
import { getActiveTimer } from "@/features/time/queries";
import { estimateReport } from "@/features/time/stats";
import { formatSeconds } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { today, timezone, weekStartDay } = await getUserSettings();
  let preset = parsePreset(sp.range);
  let range = resolveRange(preset, today, weekStartDay, { from: sp.from, to: sp.to });
  const invalidCustom = preset === "custom" && !range;
  if (!range) { preset = "this_week"; range = resolveRange(preset, today, weekStartDay)!; }

  const [{ report, sessions, titles }, categories, { timer }] = await Promise.all([loadReport(range, today, timezone), listCategories(), getActiveTimer()]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const estimates = estimateReport(sessions).sort((a, b) => b.varianceSeconds - a.varianceSeconds);
  const over = estimates.filter((e) => e.consistentlyOver);
  const maxCat = Math.max(1, ...report.categories.map((c) => c.seconds));

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${PRESET_LABEL[preset]} · ${range.from === range.to ? range.from : `${range.from} – ${range.to}`} · ${timezone}`} />
      <RangeFilter active={preset} from={range.from} to={range.to} />
      {invalidCustom ? <p role="alert" className="mb-4 rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">That custom range is invalid (start after end, or longer than 5 years). Showing this week instead.</p> : null}
      {timer ? <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-2 text-[13px]">In progress, not yet recorded: <strong className="font-medium">{timer.title}</strong></p> : null}

      {report.summary.scheduledOccurrences === 0 && report.summary.completedDuringOccurrences === 0 && report.summary.uniqueTasksCreated === 0 && report.summary.actualSeconds === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-line-strong px-6 py-8 text-center">
          <p className="font-medium">No activity in this period</p>
          <p className="mt-1 text-ink-muted">Nothing was scheduled, completed or tracked, so there is nothing to calculate. Pick another range.</p>
        </div>
      ) : null}

      <div className="mb-6"><InsightsAssistant configured={getAiStatus().configured} preset={preset} from={range.from} to={range.to} /></div>

      <MetricCards report={report} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Charts</h2>
      <AnalyticsCharts report={report} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cats">
          <h2 id="cats" className="mb-2 text-sm font-semibold">Time by category</h2>
          {report.categories.length === 0 ? <p className="text-ink-muted">No time recorded in this period.</p> : (
            <ul className="space-y-1.5">
              {report.categories.map((c) => (
                <li key={c.categoryId ?? "none"} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="truncate">{c.categoryId ? (catName.get(c.categoryId) ?? "Archived category") : "No category"}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((c.seconds / maxCat) * 100)}%` }} /></span>
                  <span className="tabular-nums text-ink-muted">{formatSeconds(c.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="post">
          <h2 id="post" className="mb-2 text-sm font-semibold">Most postponed tasks</h2>
          {report.postponed.length === 0 ? <p className="text-ink-muted">Nothing was carried forward in this period.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {report.postponed.slice(0, 8).map((p) => (<li key={p.taskId} className="flex justify-between gap-3 px-4 py-2 text-[13px]"><span className="truncate">{titles[p.taskId] ?? "Task"}</span><span className="shrink-0 text-ink-muted">{p.count}×</span></li>))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="est" className="mt-8">
        <h2 id="est" className="mb-2 text-sm font-semibold">Estimated vs recorded by task</h2>
        {estimates.length === 0 ? <p className="text-ink-muted">Tasks with both an estimate and recorded time appear here.</p> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-xs text-ink-muted"><tr><th className="px-3 py-2 font-medium">Task</th><th className="px-3 py-2 font-medium">Estimate</th><th className="px-3 py-2 font-medium">Recorded</th><th className="px-3 py-2 font-medium">Variance</th><th className="px-3 py-2 font-medium">Entries over</th></tr></thead>
              <tbody className="divide-y divide-line">
                {estimates.slice(0, 15).map((e) => (
                  <tr key={e.taskId}>
                    <td className="max-w-48 truncate px-3 py-2">{e.title}</td>
                    <td className="px-3 py-2 tabular-nums">{formatSeconds(e.estimateSeconds)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatSeconds(e.actualSeconds)}</td>
                    <td className={`px-3 py-2 tabular-nums ${e.varianceSeconds > 0 ? "text-pri-high" : "text-success"}`}>{e.varianceSeconds > 0 ? "+" : "−"}{formatSeconds(Math.abs(e.varianceSeconds))}</td>
                    <td className="px-3 py-2 tabular-nums">{e.overOccurrences}/{e.trackedOccurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {over.length ? <p className="mt-3 text-[13px] text-pri-high">Consistently over estimate: {over.map((e) => e.title).join(", ")}</p> : null}
      </section>

      <p className="mt-8 text-xs text-ink-muted">Definitions and denominators: see docs/analytics.md. Running timers are never counted until stopped.</p>
    </>
  );
}
