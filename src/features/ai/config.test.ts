import { describe, expect, it } from "vitest";
import { estimateCostUsd, readAiConfig } from "./config";

describe("readAiConfig", () => {
  it("is not configured without a key or model, and names only the missing variables", () => {
    expect(readAiConfig({})).toEqual({ configured: false, missing: ["GEMINI_API_KEY", "GEMINI_MODEL"] });
    expect(readAiConfig({ GEMINI_API_KEY: "k" })).toEqual({ configured: false, missing: ["GEMINI_MODEL"] });
    expect(readAiConfig({ GEMINI_MODEL: "m-1" })).toEqual({ configured: false, missing: ["GEMINI_API_KEY"] });
  });
  it("treats blank values as missing and has no hardcoded model default", () => {
    const r = readAiConfig({ GEMINI_API_KEY: "  ", GEMINI_MODEL: "" });
    expect(r.configured).toBe(false);
  });
  it("rejects malformed model names", () => {
    const r = readAiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "bad model; drop" });
    expect(r).toEqual({ configured: false, missing: ["GEMINI_MODEL (invalid format)"] });
  });
  it("applies small-app defaults and bounds", () => {
    const r = readAiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "some-model" });
    expect(r.configured && r.config).toMatchObject({ hourLimit: 20, dayLimit: 100, timeoutMs: 45_000, priceInPerMTok: null });
    const o = readAiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "some-model", AI_RATE_LIMIT_PER_HOUR: "5", AI_RATE_LIMIT_PER_DAY: "99999999", AI_TIMEOUT_MS: "1" });
    expect(o.configured && o.config).toMatchObject({ hourLimit: 5, dayLimit: 100, timeoutMs: 45_000 });
  });
  it("estimates cost only when both prices are configured", () => {
    expect(estimateCostUsd({ priceInPerMTok: null, priceOutPerMTok: 10 }, 1000, 1000)).toBeNull();
    expect(estimateCostUsd({ priceInPerMTok: 2, priceOutPerMTok: 10 }, 500_000, 100_000)).toBe(2);
  });
});
