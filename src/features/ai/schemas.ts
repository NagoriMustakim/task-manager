import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const alias = z.string().min(1).max(12);
const short = (n: number) => z.string().max(n);

/** Destinations are expressed as "days from today" so the server, not the model, computes dates. */
const days = z.number().int().min(0).max(30);

export const planSchema = z.object({
  summary: short(500),
  overloaded: z.boolean(),
  overloadReason: short(300).nullable(),
  blocks: z.array(z.object({ alias, start: HHMM, end: HHMM, note: short(160).nullable() })).max(40),
  defer: z.array(z.object({ alias, daysFromToday: days, reason: short(240) })).max(40),
  tips: z.array(short(200)).max(4),
});

export const carrySchema = z.object({
  items: z.array(z.object({ alias, daysFromToday: days, reason: short(260) })).max(40),
  note: short(300).nullable(),
});

export const draftSchema = z.object({
  title: short(200),
  date: z.string().nullable(),
  startTime: HHMM.nullable(),
  endTime: HHMM.nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable(),
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  ambiguities: z.array(short(160)).max(6),
  confidence: z.enum(["low", "medium", "high"]),
});

export const insightsSchema = z.object({
  headline: short(240),
  points: z.array(z.object({ title: short(120), detail: short(500), metricRefs: z.array(short(60)).max(6) })).max(8),
  attention: z.array(z.object({ alias, reason: short(240) })).max(8),
  nextSteps: z.array(short(240)).max(5),
});

export const endOfDaySchema = z.object({
  summary: short(600),
  wins: z.array(short(200)).max(6),
  unfinishedPriorities: z.array(z.object({ alias, reason: short(240) })).max(8),
  nextActions: z.array(z.object({ text: short(240), alias: alias.nullable() })).max(6),
});

export const weeklySchema = z.object({
  narrative: short(1200),
  strengths: z.array(short(240)).max(5),
  bottlenecks: z.array(short(240)).max(5),
  repeatedPostponements: z.array(z.object({ alias, note: short(240) })).max(6),
  recommendations: z.array(short(260)).max(6),
});

export const breakdownSchema = z.object({
  subtasks: z.array(z.object({ title: short(140), estimatedMinutes: z.number().int().min(1).max(1440).nullable() })).min(1).max(12),
  note: short(300).nullable(),
});

export type Plan = z.infer<typeof planSchema>;
export type Carry = z.infer<typeof carrySchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Insights = z.infer<typeof insightsSchema>;
export type EndOfDay = z.infer<typeof endOfDaySchema>;
export type Weekly = z.infer<typeof weeklySchema>;
export type Breakdown = z.infer<typeof breakdownSchema>;

export const isValidDraftDate = (d: string | null): d is string => d !== null && isIsoDate(d);

const STRIP = new Set(["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern", "format", "$schema", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);
/**
 * JSON Schema sent to the API: structure only. Length/range keywords are removed because structured
 * output supports a subset of JSON Schema; Zod enforces the real constraints on the response.
 */
export function toApiSchema(schema: z.ZodType): Record<string, unknown> {
  const prune = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(prune);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).filter(([k]) => !STRIP.has(k)).map(([k, v]) => [k, prune(v)]));
    }
    return node;
  };
  return prune(z.toJSONSchema(schema)) as Record<string, unknown>;
}
