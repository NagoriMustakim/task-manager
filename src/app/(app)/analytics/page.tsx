import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/page-header";
import { computeStats } from "@/features/stats/compute";
import { PRESETS, PRESET_LABEL, parsePreset, resolveRange } from "@/features/stats/ranges";
import { listTodos } from "@/features/todos/queries";
import { PRIORITY_LABEL, STATUS_LABEL, type Todo } from "@/features/todos/types";
import { requireUser } from "@/lib/auth/session";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "Analytics" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; user?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireUser()]);
  const today = getToday();
  let preset = parsePreset(sp.range);
  let range = resolveRange(preset, today, { from: sp.from, to: sp.to });
  const invalid = preset === "custom" && !range;
  if (!range) { preset = "this_week"; range = resolveRange(preset, today)!; }

  // Administrators can pick any user (row-level security lets them read all users; everyone else only sees themselves).
  let users: { id: string; email: string | null }[] = [];
  let subject = { id: me.id, email: me.email };
  if (me.role === "admin") {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id, email").order("email");
    users = data ?? [];
    const chosen = users.find((u) => u.id === sp.user);
    if (chosen) subject = chosen;
  }

  const todos = await listTodos({ kind: "range", from: range.from, to: range.to }, subject.id);
  const stats = computeStats(todos, today);
  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.total));
  const viewingOther = subject.id !== me.id;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(viewingOther ? { user: subject.id } : {}), ...extra }).toString();
  const pill = "h-8 shrink-0 rounded-full border border-line-strong px-3 text-xs leading-8 hover:bg-line/50 aria-[current=true]:border-accent aria-[current=true]:font-medium aria-[current=true]:text-accent";
  const card = "rounded-xl border border-line bg-surface px-3 py-2.5";

  const byDayList = new Map<string, Todo[]>();
  for (const t of todos) byDayList.set(t.date, [...(byDayList.get(t.date) ?? []), t]);

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${range.from === range.to ? formatLongDate(range.from) : `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`}`} />

      {me.role === "admin" ? (
        <form action="/analytics" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
          <input type="hidden" name="range" value={preset} />
          {preset === "custom" ? (<><input type="hidden" name="from" value={range.from} /><input type="hidden" name="to" value={range.to} /></>) : null}
          <label className="text-xs text-ink-muted">Show tasks for
            <select name="user" defaultValue={subject.id} className="mt-0.5 block h-9 min-w-56 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
              {users.map((u) => (<option key={u.id} value={u.id}>{u.email ?? u.id}{u.id === me.id ? " (me)" : ""}</option>))}
            </select>
          </label>
          <button className="h-9 rounded-control bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover">View</button>
        </form>
      ) : null}
      {viewingOther ? <p role="status" className="mb-4 rounded-control border border-line bg-surface px-3 py-2 text-[13px]">Viewing <strong>{subject.email}</strong>. Read-only.</p> : null}

      <nav aria-label="Date range" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PRESETS.filter((p) => p !== "custom").map((p) => (<Link key={p} href={`/analytics?${qs({ range: p })}`} aria-current={preset === p} className={pill}>{PRESET_LABEL[p]}</Link>))}
      </nav>
      <form action="/analytics" className="mb-5 flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        {viewingOther ? <input type="hidden" name="user" value={subject.id} /> : null}
        <label className="text-xs text-ink-muted">From<input type="date" name="from" defaultValue={range.from} required className="mt-0.5 block h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink" /></label>
        <label className="text-xs text-ink-muted">To<input type="date" name="to" defaultValue={range.to} required className="mt-0.5 block h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink" /></label>
        <button className="h-8 rounded-control border border-line-strong px-3 text-xs hover:bg-line/50">Apply</button>
      </form>
      {invalid ? <p role="alert" className="mb-4 text-[13px] text-danger">That custom range is invalid (start after end, or longer than a year). Showing this week.</p> : null}

      {stats.total === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center"><p className="font-medium">No tasks in this range</p><p className="mt-1 text-ink-muted">Pick another range{viewingOther ? " or user" : ""}.</p></div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className={card}><dt className="text-xs text-ink-muted">Total</dt><dd className="text-xl font-semibold tabular-nums">{stats.total}</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">Done</dt><dd className="text-xl font-semibold tabular-nums text-success">{stats.done}</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">Completion rate</dt><dd className="text-xl font-semibold tabular-nums">{pct(stats.rate)}</dd><dd className="text-[11px] text-ink-muted">{stats.done} of {stats.due} planned up to today</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">Overdue</dt><dd className={`text-xl font-semibold tabular-nums ${stats.overdue ? "text-danger" : ""}`}>{stats.overdue}</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">New</dt><dd className="text-xl font-semibold tabular-nums">{stats.fresh}</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">Pending</dt><dd className="text-xl font-semibold tabular-nums">{stats.pending}</dd></div>
            <div className={card}><dt className="text-xs text-ink-muted">Incomplete</dt><dd className="text-xl font-semibold tabular-nums">{stats.incomplete}</dd></div>
          </dl>

          <section aria-labelledby="pri" className="mt-6">
            <h2 id="pri" className="mb-2 text-sm font-semibold">By priority</h2>
            <ul className="space-y-1.5">
              {stats.byPriority.map((p) => (
                <li key={p.priority} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-[13px]">
                  <span>{PRIORITY_LABEL[p.priority]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden><span className="block h-full rounded-full bg-success" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></span>
                  <span className="tabular-nums text-ink-muted">{p.done}/{p.total} done</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="days" className="mt-6">
            <h2 id="days" className="mb-2 text-sm font-semibold">By day</h2>
            <ul className="space-y-1.5">
              {stats.byDay.map((d) => (
                <li key={d.date} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-[13px]">
                  <span>{formatShortDate(d.date)}</span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-accent/30" style={{ width: `${(d.total / maxDay) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${(d.done / maxDay) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-ink-muted">{d.done}/{d.total}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="tasks" className="mt-6">
            <h2 id="tasks" className="mb-2 text-sm font-semibold">Tasks{viewingOther ? ` of ${subject.email}` : ""}</h2>
            <div className="space-y-4">
              {[...byDayList].map(([date, list]) => (
                <div key={date}>
                  <h3 className="mb-1 text-xs font-medium text-ink-muted">{formatLongDate(date)} · {list.length}</h3>
                  <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]">
                        <span className={`min-w-0 flex-1 break-words ${t.status === "done" ? "text-ink-muted line-through" : ""}`}>{t.title}</span>
                        <span className="text-xs text-ink-muted">{PRIORITY_LABEL[t.priority]}{t.start ? ` · ${t.start}${t.end ? `–${t.end}` : ""}` : ""}</span>
                        <span className={`w-20 text-right text-xs ${t.status === "done" ? "text-success" : t.status === "incomplete" ? "text-danger" : "text-ink-muted"}`}>{STATUS_LABEL[t.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {todos.length >= 500 ? <p className="mt-2 text-xs text-ink-muted">Showing the first 500 tasks in this range.</p> : null}
          </section>
        </>
      )}
    </>
  );
}
