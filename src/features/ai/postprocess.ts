import { addDays, isIsoDate } from "@/lib/dates";
import type { Aliaser } from "./payload";
import type { Carry, Draft, Insights, Plan } from "./schemas";

/**
 * Turns validated model output into safe suggestions. The model may only reference refs it was
 * given, and every date/time is re-checked here; anything else is dropped (and counted).
 */
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface FixedBlock { start: string; end: string }
export interface PlanBlock { id: string; start: string; end: string; note: string | null }
export interface Deferral { id: string; date: string; reason: string }

export function resolvePlan(
  plan: Plan,
  aliases: Aliaser,
  ctx: { today: string; workStart: string; workEnd: string; fixed: FixedBlock[]; schedulable: Set<string> },
) {
  let dropped = 0;
  const blocks: PlanBlock[] = [];
  const taken = [...ctx.fixed].map((f) => [toMin(f.start), toMin(f.end)] as const);
  const seen = new Set<string>();
  for (const b of [...plan.blocks].sort((a, b) => toMin(a.start) - toMin(b.start))) {
    const id = aliases.resolve(b.alias);
    const s = toMin(b.start), e = toMin(b.end);
    const ok = id && ctx.schedulable.has(id) && !seen.has(id) && s < e && s >= toMin(ctx.workStart) && e <= toMin(ctx.workEnd) && !taken.some(([ts, te]) => s < te && e > ts);
    if (!ok) { dropped++; continue; }
    seen.add(id);
    taken.push([s, e]);
    blocks.push({ id, start: b.start, end: b.end, note: b.note });
  }
  const defer: Deferral[] = [];
  for (const d of plan.defer) {
    const id = aliases.resolve(d.alias);
    if (!id || !ctx.schedulable.has(id) || seen.has(id) || defer.some((x) => x.id === id) || d.daysFromToday < 1) { dropped++; continue; }
    defer.push({ id, date: addDays(ctx.today, d.daysFromToday), reason: d.reason });
  }
  return { summary: plan.summary, overloaded: plan.overloaded, overloadReason: plan.overloadReason, tips: plan.tips, blocks, defer, dropped };
}

export interface Recommendation { id: string; date: string; reason: string }
export function resolveCarry(carry: Carry, aliases: Aliaser, ctx: { today: string; candidates: Set<string> }) {
  let dropped = 0;
  const items: Recommendation[] = [];
  for (const i of carry.items) {
    const id = aliases.resolve(i.alias);
    if (!id || !ctx.candidates.has(id) || items.some((x) => x.id === id)) { dropped++; continue; }
    items.push({ id, date: addDays(ctx.today, i.daysFromToday), reason: i.reason });
  }
  return { items, note: carry.note, dropped };
}

export interface ValidatedDraft {
  title: string; date: string | null; startTime: string | null; endTime: string | null;
  priority: "low" | "medium" | "high" | "urgent" | null; durationMinutes: number | null;
  ambiguities: string[]; needsReview: boolean;
}

/** Never silently accepts a bad date or time: invalid parts are nulled and flagged for the person to fix. */
export function validateDraft(raw: Draft, ctx: { today: string }): ValidatedDraft {
  const ambiguities = [...raw.ambiguities];
  let date: string | null = raw.date;
  if (date !== null && (!isIsoDate(date) || date < addDays(ctx.today, -366) || date > addDays(ctx.today, 366 * 2))) {
    ambiguities.push("The date couldn't be validated; choose one.");
    date = null;
  }
  let start = raw.startTime, end = raw.endTime;
  if (end && (!start || toMin(end) <= toMin(start))) {
    ambiguities.push("The end time didn't make sense; check the times.");
    end = null;
  }
  if (!start && end) end = null;
  if (date && date < ctx.today) ambiguities.push("This date is in the past.");
  if (start && !date) ambiguities.push("A time was given without a date.");
  const title = raw.title.trim();
  return {
    title, date, startTime: start, endTime: end, priority: raw.priority, durationMinutes: raw.durationMinutes,
    ambiguities, needsReview: raw.confidence !== "high" || ambiguities.length > 0 || !title || date === null,
  };
}

/** Keeps only metric references that really exist in the metrics the server supplied. */
export function resolveInsights(raw: Insights, aliases: Aliaser, metricNames: Set<string>) {
  let dropped = 0;
  const points = raw.points.map((p) => ({ ...p, metricRefs: p.metricRefs.filter((m) => metricNames.has(m)) }));
  const unsupported = points.filter((p) => p.metricRefs.length === 0).length;
  const attention = raw.attention.flatMap((a) => {
    const id = aliases.resolve(a.alias);
    if (!id) { dropped++; return []; }
    return [{ id, reason: a.reason }];
  });
  return { headline: raw.headline, points, attention, nextSteps: raw.nextSteps, dropped, unsupportedPoints: unsupported };
}
