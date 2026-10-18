/**
 * Reads AI settings from environment variables. Pure (takes `env`) so it is testable.
 * The key and model are NEVER hardcoded or given NEXT_PUBLIC_ names; this module is imported only
 * by server code.
 */
export interface AiConfig {
  apiKey: string;
  model: string;
  hourLimit: number;
  dayLimit: number;
  timeoutMs: number;
  /** Optional USD per million tokens, from your own pricing; cost is only estimated when both are set. */
  priceInPerMTok: number | null;
  priceOutPerMTok: number | null;
}
export type AiConfigResult = { configured: true; config: AiConfig } | { configured: false; missing: string[] };

const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};
const price = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 && n < 10_000 ? n : null;
};

export function readAiConfig(env: Record<string, string | undefined>): AiConfigResult {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  const missing: string[] = [];
  if (!apiKey) missing.push("GEMINI_API_KEY");
  if (!model) missing.push("GEMINI_MODEL");
  else if (!/^[A-Za-z0-9._:/-]{3,100}$/.test(model)) missing.push("GEMINI_MODEL (invalid format)");
  if (missing.length || !apiKey || !model) return { configured: false, missing };
  return {
    configured: true,
    config: {
      apiKey,
      model,
      hourLimit: int(env.AI_RATE_LIMIT_PER_HOUR, 20, 1, 1000),
      dayLimit: int(env.AI_RATE_LIMIT_PER_DAY, 100, 1, 10_000),
      timeoutMs: int(env.AI_TIMEOUT_MS, 45_000, 5_000, 120_000),
      priceInPerMTok: price(env.AI_PRICE_INPUT_PER_MTOK),
      priceOutPerMTok: price(env.AI_PRICE_OUTPUT_PER_MTOK),
    },
  };
}

export function estimateCostUsd(config: Pick<AiConfig, "priceInPerMTok" | "priceOutPerMTok">, input: number, output: number): number | null {
  if (config.priceInPerMTok === null || config.priceOutPerMTok === null) return null;
  return Math.round(((input * config.priceInPerMTok + output * config.priceOutPerMTok) / 1_000_000) * 1e6) / 1e6;
}
