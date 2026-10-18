import { createHash } from "node:crypto";

/** Stable hash of (feature, model, subject, input) so identical requests reuse a cached answer. */
export function cacheKey(parts: { feature: string; model: string; subjectId: string; input: unknown }): string {
  const canonical = JSON.stringify(parts, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export const CACHE_TTL_SECONDS: Record<string, number> = {
  plan: 600, carry: 600, insights: 3600, endOfDay: 1800, weekly: 3600, parse: 0, breakdown: 3600,
};
