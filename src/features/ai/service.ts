import "server-only";
import type { z } from "zod";
import { loadReport } from "@/features/analytics/queries";
import { overloadedDays, repeatedlyPostponed, type Report } from "@/features/analytics/compute";
import { granularityFor, parsePreset, previousRange, resolveRange, type Preset } from "@/features/analytics/ranges";
import { isUnfinished } from "@/features/tasks/metrics";
import { getItemsByIds, getUserSettings, listItems } from "@/features/tasks/queries";
import { estimateReport } from "@/features/time/stats";
import { getSessionUser } from "@/lib/auth/session";
import { addDays, formatLongDate, isIsoDate, weekdayOf } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { hasReadGrant } from "@/lib/auth/grant";
import { authorizeSubject } from "./authz";
import { CACHE_TTL_SECONDS, cacheKey } from "./cache-key";
import { getAiRuntime } from "./client";
import { AiError, aiError } from "./errors";
import { Aliaser, clean } from "./payload";
import { resolveCarry, resolveInsights, resolvePlan, validateDraft } from "./postprocess";
import { SYSTEM, userMessage } from "./prompts";
import { breakdownSchema, carrySchema, draftSchema, endOfDaySchema, insightsSchema, planSchema, weeklySchema } from "./schemas";
import { callStructured } from "./structured";
import { completeCall, getCached, putCached, reserveCall } from "./usage";
import { buildMetricsDict, capacityByDay, estimateOf, fixedBlocks, metricNames, minutesBetween, pickTop, taskFact } from "./facts";
import type { Weekly } from "./schemas";

const MAX_TASKS = 40;

interface Ctx {
  requesterId: string;
  subjectId: string;
  settings: Awaited<ReturnType<typeof getUserSettings>>;
}

/** Authentication and authorisation happen first, before any data is read or sent to the model. */
async function context(subject?: string | null): Promise<Ctx> {
  const me = await getSessionUser();
  if (!me) throw aiError("unauthenticated");
  const subjectId = await authorizeSubject({ id: me.id, role: me.role }, subject, hasReadGrant);
  return { requesterId: me.id, subjectId, settings: await getUserSettings(subjectId) };
}

/** Counts of reschedules per task (net of undone), for the given tasks only. */
async function postponementCounts(subjectId: string, taskIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (taskIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("task_events").select("task_id, event_type").eq("user_id", subjectId).in("task_id", taskIds.slice(0, 200)).in("event_type", ["rescheduled", "reschedule_undone"]).limit(3000);
  for (const e of data ?? []) out.set(e.task_id, (out.get(e.task_id) ?? 0) + (e.event_type === "rescheduled" ? 1 : -1));
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}

async function historyFacts(ctx: Ctx) {
  const { today, timezone } = ctx.settings;
  const { report, sessions } = await loadReport({ from: addDays(today, -14), to: addDays(today, -1) }, today, timezone, ctx.subjectId);
  const rows = estimateReport(sessions);
  const est = rows.reduce((n, r) => n + r.estimateSeconds * Math.max(1, r.trackedOccurrences), 0);
  const act = rows.reduce((n, r) => n + r.actualSeconds, 0);
  return {
    last14Days: {
      completionRatePct: report.summary.completionRate === null ? null : Math.round(report.summary.completionRate * 100),
      avgCompletedPerDay: report.summary.avgDailyCompletion === null ? null : Math.round(report.summary.avgDailyCompletion * 10) / 10,
      recordedVsEstimatedRatio: est > 0 ? Math.round((act / est) * 100) / 100 : null,
    },
  };
}

/** Runs one AI feature: cache -> rate limit -> model -> validate -> cache. Never logs prompts. */
async function run<D, R>(a: {
  feature: keyof typeof SYSTEM; ctx: Ctx; schema: z.ZodType<D>; maxTokens: number; user: string; keyInput: unknown;
  finish: (data: D) => R;
}): Promise<R & { cached: boolean }> {
  const { config, client } = getAiRuntime();
  const key = cacheKey({ feature: a.feature, model: config.model, subjectId: a.ctx.subjectId, input: a.keyInput });
  const ttl = CACHE_TTL_SECONDS[a.feature] ?? 0;
  if (ttl > 0) {
    const hit = await getCached<R>(key);
    if (hit) return { ...hit, cached: true };
  }
  const callId = await reserveCall(a.feature, config);
  try {
    const res = await callStructured({ client, model: config.model, system: SYSTEM[a.feature], user: a.user, schema: a.schema, maxTokens: a.maxTokens, timeoutMs: config.timeoutMs });
    await completeCall(callId, config, { ok: true, usage: res.usage, model: res.model });
    const out = a.finish(res.data);
    if (ttl > 0) await putCached(key, a.feature, out, ttl);
    return { ...out, cached: false };
  } catch (e) {
    const err = e instanceof AiError ? e : aiError("upstream");
    await completeCall(callId, config, { ok: false, error: err });
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
export async function planDay(input: { date?: string | null }) {
  const ctx = await context(null);
  const { today, timezone, workStart, workEnd } = ctx.settings;
  const date = input.date && isIsoDate(input.date) ? input.date : today;
  if (date < today || date > addDays(today, 30)) throw aiError("invalid_input");

  const [day, overdue, history] = await Promise.all([
    listItems({ kind: "day", date }, timezone, 300, ctx.subjectId),
    date === today ? listItems({ kind: "overdue", before: today }, timezone, 100, ctx.subjectId) : Promise.resolve([]),
    historyFacts(ctx),
  ]);
  const open = [...overdue, ...day.filter((i) => !overdue.some((o) => o.id === i.id))].filter(isUnfinished);
  const top = pickTop(open, MAX_TASKS);
  const aliases = new Aliaser();
  const postponed = await postponementCounts(ctx.subjectId, top.map((i) => i.taskId));
  const facts = top.map((i) => taskFact(i, aliases, postponed));

  const fixed = fixedBlocks(top);
  const workMinutes = minutesBetween(workStart, workEnd);
  const available = Math.max(0, workMinutes - fixed.reduce((n, b) => n + minutesBetween(b.start, b.end), 0));
  const schedulable = top.filter((i) => !i.startTime);
  const planned = schedulable.reduce((n, i) => n + estimateOf(i), 0);
  const payload = {
    date, weekday: weekdayOf(date), timezone, workingHours: { start: workStart, end: workEnd }, workMinutes,
    availableMinutes: available, plannedMinutes: planned, overloadMinutes: Math.max(0, planned - available),
    omittedTasks: Math.max(0, open.length - top.length), tasks: facts, history,
  };
  return run({
    feature: "plan", ctx, schema: planSchema, maxTokens: 2500, keyInput: payload,
    user: userMessage({ instruction: `Plan ${formatLongDate(date)}. Times are in ${timezone}. Refs in your answer must come from the tasks list.`, blocks: [["task_data", payload]] }),
    finish: (plan) => ({
      ...resolvePlan(plan, aliases, { today, workStart, workEnd, fixed, schedulable: new Set(schedulable.map((i) => i.id)) }),
      date, availableMinutes: available, plannedMinutes: planned,
    }),
  });
}

export async function recommendCarryForward(input: { date?: string | null }) {
  const ctx = await context(null);
  const { today, timezone, workStart, workEnd } = ctx.settings;
  const date = input.date && isIsoDate(input.date) ? input.date : today;
  if (date > today) throw aiError("invalid_input");

  const [day, overdue, upcoming] = await Promise.all([
    listItems({ kind: "day", date }, timezone, 300, ctx.subjectId),
    date === today ? listItems({ kind: "overdue", before: today }, timezone, 100, ctx.subjectId) : Promise.resolve([]),
    listItems({ kind: "upcoming", after: today }, timezone, 300, ctx.subjectId),
  ]);
  const candidates = pickTop([...overdue, ...day.filter((i) => !overdue.some((o) => o.id === i.id))].filter(isUnfinished), MAX_TASKS);
  if (candidates.length === 0) return { items: [], note: "Nothing unfinished to carry forward.", dropped: 0, cached: false };
  const aliases = new Aliaser();
  const postponed = await postponementCounts(ctx.subjectId, candidates.map((i) => i.taskId));
  const payload = {
    today, timezone, tasks: candidates.map((i) => taskFact(i, aliases, postponed)),
    capacity: capacityByDay(upcoming, today, minutesBetween(workStart, workEnd)),
  };
  return run({
    feature: "carry", ctx, schema: carrySchema, maxTokens: 2500, keyInput: payload,
    user: userMessage({ instruction: "Recommend when each unfinished task should be done. Use each ref at most once.", blocks: [["task_data", payload]] }),
    finish: (c) => resolveCarry(c, aliases, { today, candidates: new Set(candidates.map((i) => i.id)) }),
  });
}

export async function parseTaskText(input: { text: string }) {
  const text = clean(input.text, 500);
  if (text.length < 3) throw aiError("invalid_input");
  const ctx = await context(null);
  const { today, timezone } = ctx.settings;
  const payload = { today, weekday: weekdayOf(today), timezone };
  return run({
    feature: "parse", ctx, schema: draftSchema, maxTokens: 600, keyInput: { payload, text },
    user: userMessage({ instruction: "Convert this sentence into a task draft.", blocks: [["task_data", payload], ["user_text", text]] }),
    finish: (d) => ({ draft: validateDraft(d, { today }) }),
  });
}

export async function breakDownTask(input: { occurrenceId?: string | null; title?: string | null; notes?: string | null }) {
  const ctx = await context(null);
  let title = clean(input.title, 200), notes = clean(input.notes, 1500);
  if (input.occurrenceId) {
    const [item] = await getItemsByIds([input.occurrenceId], ctx.settings.timezone, ctx.subjectId);
    if (!item) throw aiError("invalid_input");
    title = clean(item.title, 200);
    notes = clean(item.notes, 1500);
  }
  if (title.length < 3) throw aiError("invalid_input");
  const payload = { title, notes: notes || null };
  return run({
    feature: "breakdown", ctx, schema: breakdownSchema, maxTokens: 1200, keyInput: payload,
    user: userMessage({ instruction: "Break this task into subtasks.", blocks: [["task_data", payload]] }),
    finish: (b) => ({ subtasks: b.subtasks, note: b.note }),
  });
}

// --- analytics-backed features: the model explains numbers the server already computed ----------
async function reportBundle(ctx: Ctx, range: { from: string; to: string }, prevRange: { from: string; to: string }) {
  const { today, timezone } = ctx.settings;
  const [cur, prev] = await Promise.all([loadReport(range, today, timezone, ctx.subjectId), loadReport(prevRange, today, timezone, ctx.subjectId)]);
  return { cur, prev };
}

function reportFacts(cur: Report, prev: Report, titles: Record<string, string>, aliases: Aliaser, postponedTasks: { taskId: string; count: number }[]) {
  return {
    overloadedDays: overloadedDays(cur.series).filter(() => granularityFor(cur.range) !== "hour").map((b) => ({ date: b.key, tasks: b.scheduled, plannedMinutes: Math.round(b.estimatedSeconds / 60) })),
    repeatedlyPostponed: repeatedlyPostponed(cur).map((p) => ({ ref: aliases.alias(p.taskId), title: clean(titles[p.taskId] ?? "Task", 100), times: p.count })),
    mostPostponed: postponedTasks.slice(0, 5).map((p) => ({ ref: aliases.alias(p.taskId), title: clean(titles[p.taskId] ?? "Task", 100), times: p.count })),
    priority: cur.priority.filter((p) => p.due > 0).map((p) => ({ priority: p.priority, due: p.due, done: p.done })),
    dailyTrend: cur.granularity === "day" ? cur.series.map((b) => ({ d: b.key, due: b.due, done: b.done })).slice(-31) : undefined,
    previousExists: prev.summary.scheduledOccurrences + prev.summary.completedDuringOccurrences > 0,
  };
}

export async function explainInsights(input: { preset?: string; from?: string; to?: string; subjectId?: string | null }) {
  const ctx = await context(input.subjectId);
  const { today, weekStartDay } = ctx.settings;
  const preset: Preset = parsePreset(input.preset);
  const range = resolveRange(preset, today, weekStartDay, { from: input.from, to: input.to });
  if (!range) throw aiError("invalid_input");
  const { cur, prev } = await reportBundle(ctx, range, previousRange(range, preset));
  const aliases = new Aliaser();
  const metrics = buildMetricsDict(cur.report, prev.report);
  const facts = reportFacts(cur.report, prev.report, { ...prev.titles, ...cur.titles }, aliases, cur.report.postponed);
  const est = estimateReport(cur.sessions).sort((a, b) => b.varianceSeconds - a.varianceSeconds).slice(0, 5).map((r) => ({ ref: aliases.alias(r.taskId), title: clean(r.title, 100), estimateMin: Math.round(r.estimateSeconds / 60), recordedMin: Math.round(r.actualSeconds / 60), entriesOver: r.overOccurrences, entries: r.trackedOccurrences }));
  const high = await highPriorityOpen(ctx, aliases);
  const payload = { period: range, previousPeriod: previousRange(range, preset), metrics, facts, estimates: est, highPriorityOpen: high.facts };
  return run({
    feature: "insights", ctx, schema: insightsSchema, maxTokens: 2000, keyInput: payload,
    user: userMessage({ instruction: "Explain these productivity metrics for the selected period. metricRefs must be names from metrics.", blocks: [["metrics", payload]] }),
    finish: (raw) => ({ ...resolveInsights(raw, aliases, metricNames(metrics)), attentionTitles: high.titles, period: range }),
  });
}

async function highPriorityOpen(ctx: Ctx, aliases: Aliaser) {
  const { today, timezone } = ctx.settings;
  const [overdue, upcoming] = await Promise.all([
    listItems({ kind: "overdue", before: addDays(today, 1) }, timezone, 100, ctx.subjectId),
    listItems({ kind: "upcoming", after: today }, timezone, 100, ctx.subjectId),
  ]);
  const hp = [...overdue, ...upcoming].filter((i) => isUnfinished(i) && (i.priority === "high" || i.priority === "urgent"));
  const top = pickTop(hp, 10);
  const postponed = await postponementCounts(ctx.subjectId, top.map((i) => i.taskId));
  return { facts: top.map((i) => taskFact(i, aliases, postponed)), titles: Object.fromEntries(top.map((i) => [i.id, clean(i.title, 120)])) };
}

export async function endOfDayReview(input: { date?: string | null; subjectId?: string | null }) {
  const ctx = await context(input.subjectId);
  const { today, timezone } = ctx.settings;
  const date = input.date && isIsoDate(input.date) && input.date <= today ? input.date : today;
  const [day, done, { report }] = await Promise.all([
    listItems({ kind: "day", date }, timezone, 300, ctx.subjectId),
    listItems({ kind: "completedOn", date }, timezone, 300, ctx.subjectId),
    loadReport({ from: date, to: date }, today, timezone, ctx.subjectId),
  ]);
  const aliases = new Aliaser();
  const open = pickTop(day.filter(isUnfinished), MAX_TASKS);
  const postponed = await postponementCounts(ctx.subjectId, open.map((i) => i.taskId));
  const metrics = buildMetricsDict(report, null);
  const payload = {
    date, plannedCount: day.filter((i) => !i.movedToId).length, completedCount: done.length, completedTitles: done.slice(0, 15).map((i) => clean(i.title, 80)),
    plannedMinutes: metrics.estimatedMinutes, recordedMinutes: metrics.recordedMinutes, unfinished: open.map((i) => taskFact(i, aliases, postponed)), metrics,
  };
  return run({
    feature: "endOfDay", ctx, schema: endOfDaySchema, maxTokens: 1500, keyInput: payload,
    user: userMessage({ instruction: "Summarise this day and recommend the next actions.", blocks: [["metrics", payload]] }),
    finish: (r) => ({
      summary: r.summary, wins: r.wins, date,
      unfinishedPriorities: r.unfinishedPriorities.flatMap((u) => { const id = aliases.resolve(u.alias); return id ? [{ id, reason: u.reason }] : []; }),
      nextActions: r.nextActions.map((n) => ({ text: n.text, id: n.alias ? (aliases.resolve(n.alias) ?? null) : null })),
    }),
  });
}

export async function weeklyReview(input: { start?: string | null; subjectId?: string | null }) {
  const ctx = await context(input.subjectId);
  const { today, weekStartDay } = ctx.settings;
  const base = input.start && isIsoDate(input.start) ? input.start : today;
  const back = (weekdayOf(base) - weekStartDay + 7) % 7;
  const start = addDays(base, -back);
  const range = { from: start, to: addDays(start, 6) };
  const prevR = { from: addDays(start, -7), to: addDays(start, -1) };
  const { cur, prev } = await reportBundle(ctx, range, prevR);
  const aliases = new Aliaser();
  const metrics = buildMetricsDict(cur.report, prev.report);
  const facts = reportFacts(cur.report, prev.report, { ...prev.titles, ...cur.titles }, aliases, cur.report.postponed);
  const payload = { week: range, previousWeek: prevR, metrics, facts };
  return run({
    feature: "weekly", ctx, schema: weeklySchema, maxTokens: 2000, keyInput: payload,
    user: userMessage({ instruction: "Write the weekly review for the selected week.", blocks: [["metrics", payload]] }),
    finish: (w: Weekly) => ({
      narrative: w.narrative, strengths: w.strengths, bottlenecks: w.bottlenecks, recommendations: w.recommendations, week: range,
      repeatedPostponements: w.repeatedPostponements.flatMap((r) => { const id = aliases.resolve(r.alias); return id ? [{ taskId: id, note: r.note }] : []; }),
    }),
  });
}

/** Month-to-date AI usage for the signed-in user (tokens and optional estimated cost). */
export async function usageSummary() {
  const me = await getSessionUser();
  if (!me) throw aiError("unauthenticated");
  const supabase = await createClient();
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase.from("ai_usage").select("status, input_tokens, output_tokens, estimated_cost_usd").eq("user_id", me.id).gte("created_at", since.toISOString()).limit(5000);
  const rows = data ?? [];
  const cost = rows.map((r) => r.estimated_cost_usd).filter((c): c is number => c !== null);
  return {
    calls: rows.length, failed: rows.filter((r) => r.status === "error").length,
    inputTokens: rows.reduce((n, r) => n + (r.input_tokens ?? 0), 0), outputTokens: rows.reduce((n, r) => n + (r.output_tokens ?? 0), 0),
    estimatedCostUsd: cost.length ? Math.round(cost.reduce((a, b) => a + b, 0) * 1e4) / 1e4 : null,
  };
}
