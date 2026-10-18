import "server-only";
import { createClient } from "@/lib/supabase/server";
import { estimateCostUsd, type AiConfig } from "./config";
import { AiError, aiError } from "./errors";
import type { CallUsage } from "./structured";

/** Reserves one call against the per-user hourly/daily limits (atomic, server-side). */
export async function reserveCall(feature: string, config: AiConfig): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_reserve_call", { p_feature: feature, p_hour_limit: config.hourLimit, p_day_limit: config.dayLimit });
  if (error) throw aiError(error.code === "42501" ? "unauthenticated" : "upstream");
  const r = data as { allowed: boolean; id?: string; retry_after_seconds?: number };
  if (!r.allowed || !r.id) throw aiError("rate_limited", r.retry_after_seconds);
  return r.id;
}

/** Records tokens and (if prices are configured) an estimated cost. Stores no prompt or response text. */
export async function completeCall(id: string, config: AiConfig, result: { ok: true; usage: CallUsage; model: string } | { ok: false; error: AiError }) {
  const supabase = await createClient();
  const u = result.ok ? result.usage : { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  await supabase.rpc("ai_complete_call", {
    p_id: id,
    p_status: result.ok ? "ok" : "error",
    p_model: result.ok ? result.model : config.model,
    p_input: u.inputTokens,
    p_output: u.outputTokens,
    p_cache_read: u.cacheReadTokens,
    p_cost: (result.ok ? estimateCostUsd(config, u.inputTokens, u.outputTokens) : null) as number,
    p_error: result.ok ? (null as unknown as string) : result.error.code,
  });
}

export async function getCached<T>(keyHash: string): Promise<T | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_cache").select("response, expires_at").eq("key_hash", keyHash).maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return data.response as T;
}

export async function putCached(keyHash: string, feature: string, response: unknown, ttlSeconds: number) {
  if (ttlSeconds <= 0) return;
  const supabase = await createClient();
  await supabase.from("ai_cache").upsert(
    { key_hash: keyHash, feature, response: response as never, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() },
    { onConflict: "user_id,key_hash" },
  );
}
