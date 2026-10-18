"use server";

import { z } from "zod";
import { AiError, aiError, type AiErrorCode } from "./errors";
import * as ai from "./service";

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: AiErrorCode; retryAfterSeconds?: number };

/** Every failure becomes a short, safe message; raw errors (which could echo content) are never returned. */
async function guard<T>(fn: () => Promise<T>): Promise<AiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = e instanceof AiError ? e : aiError("upstream");
    return { ok: false, error: err.userMessage, code: err.code, ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
}

const date = z.string().max(10).nullish();
const uuid = z.string().uuid().nullish();
const parse = <S extends z.ZodType>(s: S, v: unknown): z.infer<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw aiError("invalid_input");
  return r.data;
};

export const aiPlanDayAction = async (input: { date?: string | null }) =>
  guard(() => ai.planDay(parse(z.object({ date }), input)));

export const aiCarryForwardAction = async (input: { date?: string | null }) =>
  guard(() => ai.recommendCarryForward(parse(z.object({ date }), input)));

export const aiParseTaskAction = async (input: { text: string }) =>
  guard(() => ai.parseTaskText(parse(z.object({ text: z.string().min(1).max(2000) }), input)));

export const aiBreakdownAction = async (input: { occurrenceId?: string | null; title?: string | null; notes?: string | null }) =>
  guard(() => ai.breakDownTask(parse(z.object({ occurrenceId: uuid, title: z.string().max(500).nullish(), notes: z.string().max(10_000).nullish() }), input)));

export const aiInsightsAction = async (input: { preset?: string; from?: string; to?: string; subjectId?: string | null }) =>
  guard(() => ai.explainInsights(parse(z.object({ preset: z.string().max(20).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional(), subjectId: uuid }), input)));

export const aiEndOfDayAction = async (input: { date?: string | null; subjectId?: string | null }) =>
  guard(() => ai.endOfDayReview(parse(z.object({ date, subjectId: uuid }), input)));

export const aiWeeklyAction = async (input: { start?: string | null; subjectId?: string | null }) =>
  guard(() => ai.weeklyReview(parse(z.object({ start: date, subjectId: uuid }), input)));
