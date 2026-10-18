"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Report } from "../compute";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const C = { accent: "var(--color-accent)", success: "var(--color-success)", danger: "var(--color-danger)", muted: "#a3a7b3", amber: "var(--color-pri-high)" };
const axis = { fontSize: 11, fill: "var(--color-ink-muted)" } as const;
const hours = (s: number) => Math.round((s / 3600) * 10) / 10;

function Figure({ title, summary, empty, columns, rows, children }: {
  title: string; summary: string; empty: boolean; columns: string[]; rows: (string | number)[][]; children: ReactNode;
}) {
  return (
    <figure className="rounded-lg border border-line bg-surface p-3">
      <figcaption className="mb-2 text-[13px] font-medium">{title}</figcaption>
      {empty ? (
        <p className="py-10 text-center text-[13px] text-ink-muted">No data for this period.</p>
      ) : (
        <>
          <div role="img" aria-label={`${title}. ${summary}`} className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-muted">View as table</summary>
            <div className="mt-1 max-h-48 overflow-auto">
              <table className="w-full text-left">
                <thead><tr>{columns.map((c) => (<th key={c} scope="col" className="py-1 pr-3 font-medium">{c}</th>))}</tr></thead>
                <tbody>{rows.map((r, i) => (<tr key={i} className="border-t border-line">{r.map((v, j) => (j === 0 ? <th key={j} scope="row" className="py-1 pr-3 font-normal">{v}</th> : <td key={j} className="py-1 pr-3 tabular-nums">{v}</td>))}</tr>))}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </figure>
  );
}

const tip = { contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)" } };
const pct = (v: number | null) => (v === null ? 0 : Math.round(v * 100));

export function AnalyticsCharts({ report }: { report: Report }) {
  const hourly = report.granularity === "hour";
  const s = report.series;
  const label = report.granularity === "month" ? "month" : "day";
  const priorityRows = report.priority.filter((p) => p.scheduled > 0);

  const trend = hourly
    ? report.hourly.map((h) => ({ x: `${String(h.hour).padStart(2, "0")}h`, completed: h.completed }))
    : s.map((b) => ({ x: b.label, completed: b.completedDuring, rate: b.rate === null ? null : pct(b.rate) }));
  const stacked = s.map((b) => ({ x: b.label, Done: b.done, Unfinished: b.unfinished }));
  const time = s.map((b) => ({ x: b.label, Estimated: hours(b.estimatedSeconds), Recorded: hours(b.actualSeconds) }));
  const weekday = report.weekday.map((w) => ({ x: WEEKDAYS[w.weekday]!, Completed: w.completed }));
  const carried = s.map((b) => ({ x: b.label, Carried: b.carried }));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Figure
        title={hourly ? "Completions by hour" : `Completion trend by ${label}`}
        summary={hourly ? `${report.hourly.reduce((n, h) => n + h.completed, 0)} completed.` : `Bars: tasks completed per ${label}. Line: completion rate of due work.`}
        empty={trend.every((t) => !t.completed && !("rate" in t && t.rate))}
        columns={hourly ? ["Hour", "Completed"] : [label, "Completed", "Rate %"]}
        rows={trend.map((t) => (hourly ? [t.x, t.completed] : [t.x, t.completed, "rate" in t && t.rate !== null ? `${t.rate}` : "—"]))}
      >
        <ComposedChart data={trend} margin={{ left: -18, right: 6, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="x" tick={axis} interval="preserveStartEnd" minTickGap={14} />
          <YAxis yAxisId="l" allowDecimals={false} tick={axis} />
          {!hourly ? <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={axis} unit="%" /> : null}
          <Tooltip {...tip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="l" dataKey="completed" name="Completed" fill={C.accent} radius={[3, 3, 0, 0]} />
          {!hourly ? <Line yAxisId="r" dataKey="rate" name="Completion rate %" stroke={C.success} strokeWidth={2} dot={false} connectNulls={false} /> : null}
        </ComposedChart>
      </Figure>

      <Figure
        title="Completed vs unfinished"
        summary={`Due occurrences per ${label}, split into done and unfinished.`}
        empty={stacked.every((b) => b.Done + b.Unfinished === 0)}
        columns={[label, "Done", "Unfinished"]}
        rows={stacked.map((b) => [b.x, b.Done, b.Unfinished])}
      >
        <BarChart data={stacked} margin={{ left: -18, right: 6, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="x" tick={axis} interval="preserveStartEnd" minTickGap={14} />
          <YAxis allowDecimals={false} tick={axis} />
          <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Done" stackId="a" fill={C.success} />
          <Bar dataKey="Unfinished" stackId="a" fill={C.muted} radius={[3, 3, 0, 0]} />
        </BarChart>
      </Figure>

      <Figure
        title="Estimated vs recorded time (hours)"
        summary={`Planned estimate of scheduled work compared with recorded time per ${label}.`}
        empty={time.every((b) => !b.Estimated && !b.Recorded)}
        columns={[label, "Estimated h", "Recorded h"]}
        rows={time.map((b) => [b.x, b.Estimated, b.Recorded])}
      >
        <BarChart data={time} margin={{ left: -18, right: 6, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="x" tick={axis} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={axis} unit="h" />
          <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Estimated" fill={C.muted} radius={[3, 3, 0, 0]} />
          <Bar dataKey="Recorded" fill={C.accent} radius={[3, 3, 0, 0]} />
        </BarChart>
      </Figure>

      <Figure
        title="Productivity by weekday"
        summary="Occurrences completed on each weekday in the period."
        empty={weekday.every((w) => !w.Completed)}
        columns={["Weekday", "Completed"]}
        rows={weekday.map((w) => [w.x, w.Completed])}
      >
        <BarChart data={weekday} margin={{ left: -18, right: 6, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="x" tick={axis} />
          <YAxis allowDecimals={false} tick={axis} />
          <Tooltip {...tip} />
          <Bar dataKey="Completed" fill={C.accent} radius={[3, 3, 0, 0]} />
        </BarChart>
      </Figure>

      <Figure
        title="Priority distribution"
        summary="Occurrences scheduled per priority, with how many are done."
        empty={priorityRows.length === 0}
        columns={["Priority", "Scheduled", "Due", "Done", "Rate %"]}
        rows={priorityRows.map((p) => [p.priority, p.scheduled, p.due, p.done, p.rate === null ? "—" : pct(p.rate)])}
      >
        <BarChart data={priorityRows.map((p) => ({ x: p.priority, Done: p.done, Other: p.scheduled - p.done }))} layout="vertical" margin={{ left: 8, right: 8, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-line)" />
          <XAxis type="number" allowDecimals={false} tick={axis} />
          <YAxis type="category" dataKey="x" tick={axis} width={56} />
          <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Done" stackId="p" fill={C.success} />
          <Bar dataKey="Other" name="Not done" stackId="p" fill={C.muted} />
        </BarChart>
      </Figure>

      <Figure
        title="Carry-forward trend"
        summary={`Reschedules performed per ${label} (undone moves are subtracted).`}
        empty={carried.every((b) => !b.Carried)}
        columns={[label, "Carried forward"]}
        rows={carried.map((b) => [b.x, b.Carried])}
      >
        <BarChart data={carried} margin={{ left: -18, right: 6, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="x" tick={axis} interval="preserveStartEnd" minTickGap={14} />
          <YAxis allowDecimals={false} tick={axis} />
          <Tooltip {...tip} />
          <Bar dataKey="Carried" fill={C.amber} radius={[3, 3, 0, 0]} />
        </BarChart>
      </Figure>
    </div>
  );
}
