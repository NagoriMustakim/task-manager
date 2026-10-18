import { ApiError, type GenerateContentResponse } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError } from "./errors";
import { callStructured, OUTPUT_HEADROOM, type LlmClient } from "./structured";

const schema = z.object({ answer: z.string().max(20), n: z.number().int() });
const res = (text: string, extra: Record<string, unknown> = {}) =>
  ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 20, cachedContentTokenCount: 10 }, modelVersion: "gemini-test-001", ...extra }) as unknown as GenerateContentResponse;
const clientOf = (...results: (GenerateContentResponse | Error)[]) => {
  const generateContent = vi.fn();
  for (const r of results) r instanceof Error ? generateContent.mockRejectedValueOnce(r) : generateContent.mockResolvedValueOnce(r);
  return { client: { models: { generateContent } } as unknown as LlmClient, generateContent };
};
const base = { model: "gemini-test", system: "SYS", user: "USER", schema, maxTokens: 500, timeoutMs: 1000 };
const api = (status: number, message = "boom") => new ApiError({ status, message });
const code = async (p: Promise<unknown>) => { try { await p; return "no error"; } catch (e) { return e instanceof AiError ? e.code : "other"; } };

describe("callStructured: valid and invalid model responses", () => {
  it("returns validated data and usage (reasoning tokens count as output)", async () => {
    const { client } = clientOf(res('{"answer":"ok","n":3}'));
    const r = await callStructured({ ...base, client });
    expect(r.data).toEqual({ answer: "ok", n: 3 });
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 50, cacheReadTokens: 10 });
    expect(r.model).toBe("gemini-test-001");
  });
  it("accepts JSON wrapped in a code fence and ignores thought parts", async () => {
    const withThought = { candidates: [{ content: { parts: [{ text: "thinking out loud", thought: true }, { text: '```json\n{"answer":"ok","n":1}\n```' }] }, finishReason: "STOP" }] } as unknown as GenerateContentResponse;
    expect((await callStructured({ ...base, client: clientOf(withThought).client })).data.n).toBe(1);
  });
  it.each([
    ["not json at all"], ['{"answer":"ok"}'], ['{"answer":"ok","n":"3"}'], ['{"answer":"this answer is far too long for the schema","n":1}'], ['{"answer":"ok","n":1.5}'], [""],
  ])("rejects %j", async (text) => {
    expect(await code(callStructured({ ...base, client: clientOf(res(text)).client }))).toBe("invalid_output");
  });
  it("maps blocked prompts, safety stops and truncation", async () => {
    expect(await code(callStructured({ ...base, client: clientOf({ promptFeedback: { blockReason: "SAFETY" } } as unknown as GenerateContentResponse).client }))).toBe("refused");
    expect(await code(callStructured({ ...base, client: clientOf(res("{}", { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] })).client }))).toBe("refused");
    expect(await code(callStructured({ ...base, client: clientOf(res('{"answer":"o', { candidates: [{ content: { parts: [{ text: '{"answer":"o' }] }, finishReason: "MAX_TOKENS" }] })).client }))).toBe("truncated");
  });
});

describe("callStructured: request shape", () => {
  it("sends JSON mode with a structure-only schema, a timeout and token headroom, and never the key", async () => {
    const { client, generateContent } = clientOf(res('{"answer":"a","n":1}'));
    await callStructured({ ...base, client });
    const p = generateContent.mock.calls[0]![0];
    expect(p).toMatchObject({ model: "gemini-test", contents: "USER" });
    expect(p.config).toMatchObject({ systemInstruction: "SYS", responseMimeType: "application/json", maxOutputTokens: 500 * OUTPUT_HEADROOM, httpOptions: { timeout: 1000 } });
    expect(JSON.stringify(p.config.responseJsonSchema)).not.toMatch(/maxLength|minLength|\$schema/);
    expect(JSON.stringify(p)).not.toMatch(/apiKey|api_key|key/i);
  });
  it("retries once without the schema when the model rejects structured output", async () => {
    const { client, generateContent } = clientOf(api(400, "Invalid JSON payload: responseJsonSchema is not supported"), res('{"answer":"a","n":2}'));
    expect((await callStructured({ ...base, client })).data.n).toBe(2);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1]![0].config).not.toHaveProperty("responseJsonSchema");
    expect(generateContent.mock.calls[1]![0].config.systemInstruction).toMatch(/JSON only/);
  });
  it("does not retry unrelated 400s", async () => {
    const { client, generateContent } = clientOf(api(400, "contents must not be empty"));
    expect(await code(callStructured({ ...base, client }))).toBe("upstream");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("callStructured: API failures", () => {
  it.each([
    [api(400, "API key not valid. Please pass a valid API key."), "auth"], [api(401), "auth"], [api(403), "auth"], [api(404, "model not found"), "auth"],
    [api(429), "overloaded"], [api(500), "overloaded"], [api(503), "overloaded"], [api(504), "timeout"],
    [Object.assign(new Error("The operation was aborted"), { name: "AbortError" }), "timeout"],
    [new Error("fetch failed"), "upstream"],
  ])("maps %# to %s", async (err, expected) => {
    expect(await code(callStructured({ ...base, client: clientOf(err as Error).client }))).toBe(expected);
  });
  it("never leaks provider error text, keys or request content in user-facing messages", async () => {
    const { client } = clientOf(api(401, "API key AIzaSECRETKEY123 invalid"));
    try { await callStructured({ ...base, user: "my private task", client }); } catch (e) {
      expect((e as AiError).userMessage).not.toMatch(/AIza|SECRET|private task/);
      expect((e as AiError).message).not.toMatch(/AIza|SECRET|private task/);
    }
  });
});
