import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { completeCall, reserveCall } from "./usage";
import { AiError } from "./errors";
import type { AiConfig } from "./config";

const cfg: AiConfig = { apiKey: "AIza-TEST", model: "m", hourLimit: 3, dayLimit: 9, timeoutMs: 1000, priceInPerMTok: 2, priceOutPerMTok: 10 };
beforeEach(() => rpc.mockReset());

describe("rate limiting (server-side reservation)", () => {
  it("passes the configured limits and returns the reserved call id", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, id: "call-1" }, error: null });
    expect(await reserveCall("plan", cfg)).toBe("call-1");
    expect(rpc).toHaveBeenCalledWith("ai_reserve_call", { p_feature: "plan", p_hour_limit: 3, p_day_limit: 9 });
  });
  it("throws rate_limited with retry-after when the limit is hit, and never calls the model", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, scope: "hour", retry_after_seconds: 1200 }, error: null });
    await expect(reserveCall("plan", cfg)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 1200 });
  });
  it("maps auth failures and other errors to safe codes", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    await expect(reserveCall("plan", cfg)).rejects.toMatchObject({ code: "unauthenticated" });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "internal detail" } });
    await expect(reserveCall("plan", cfg)).rejects.toSatisfy((e: AiError) => e.code === "upstream" && !/internal detail/.test(e.userMessage));
  });
});

describe("usage tracking stores no content and no key", () => {
  it("records tokens and an estimated cost", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await completeCall("c1", cfg, { ok: true, usage: { inputTokens: 500_000, outputTokens: 100_000, cacheReadTokens: 0 }, model: "m" });
    const [, args] = rpc.mock.calls[0]!;
    expect(args).toMatchObject({ p_id: "c1", p_status: "ok", p_input: 500_000, p_output: 100_000, p_cost: 2 });
    expect(JSON.stringify(args)).not.toMatch(/AIza|TEST|prompt|title/);
  });
  it("records failures with only an error code", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await completeCall("c2", cfg, { ok: false, error: new AiError("timeout", "The AI request timed out.") });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_status: "error", p_error: "timeout", p_input: 0 });
  });
});
