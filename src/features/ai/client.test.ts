import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getAiRuntime, getAiStatus } from "./client";

afterEach(() => vi.unstubAllEnvs());

describe("missing API configuration", () => {
  it("reports unconfigured without throwing, so pages can render a setup message", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(getAiStatus()).toEqual({ configured: false, missing: ["GEMINI_API_KEY", "GEMINI_MODEL"] });
  });
  it("refuses to build a client and gives a safe error", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(() => getAiRuntime()).toThrowError(/AI features aren't set up/);
  });
  it("reports configured status without exposing the key", () => {
    vi.stubEnv("GEMINI_API_KEY", "AIza-SECRET");
    vi.stubEnv("GEMINI_MODEL", "some-model-id");
    const s = getAiStatus();
    expect(s).toEqual({ configured: true, missing: [] });
    expect(JSON.stringify(s)).not.toContain("SECRET");
  });
});
