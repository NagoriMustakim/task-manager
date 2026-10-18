import { ApiError, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import type { z } from "zod";
import { AiError, aiError } from "./errors";
import { toApiSchema } from "./schemas";

/** The slice of the Gemini SDK we use, so tests can pass a mock (no network, no quota used). */
export interface LlmClient {
  models: { generateContent(params: GenerateContentParameters): PromiseLike<GenerateContentResponse> };
}

export interface CallUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number }
export interface StructuredResult<T> { data: T; usage: CallUsage; model: string }

const JSON_ONLY = "\n\nRespond with a single JSON object that matches the required structure. Output JSON only, with no prose and no code fences.";
/** Gemini counts reasoning tokens against maxOutputTokens, so leave headroom for them. */
export const OUTPUT_HEADROOM = 3;
const MAX_OUTPUT_CAP = 8192;

function textOf(res: GenerateContentResponse): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => (p.thought ? "" : (p.text ?? ""))).join("").trim();
}

function parseJson(text: string): unknown {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new SyntaxError("not json");
  }
}

function mapApiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403 || e.status === 404) return aiError("auth");
    if (e.status === 400 && /api key|API_KEY_INVALID|not valid/i.test(e.message)) return aiError("auth");
    if (e.status === 408 || e.status === 504) return aiError("timeout");
    if (e.status === 429 || e.status >= 500) return aiError("overloaded");
    return aiError("upstream");
  }
  const msg = e instanceof Error ? `${e.name} ${e.message}` : "";
  if (/abort|timed? ?out|timeout/i.test(msg)) return aiError("timeout");
  return aiError("upstream");
}

const looksLikeSchemaRejection = (e: unknown) =>
  e instanceof ApiError && e.status === 400 && /schema|responseJsonSchema|response_mime|mime|json mode|structured/i.test(e.message);

const looksLikeThinkingRejection = (e: unknown) =>
  e instanceof ApiError && e.status === 400 && /thinking|thought/i.test(e.message);

/**
 * One structured request. Sends the JSON schema (structure only) with application/json output; if the
 * configured model rejects that, retries once with a JSON-only instruction. The answer is parsed and
 * validated with Zod either way, so a malformed answer is an error, never data.
 */
export async function callStructured<T>(args: {
  client: LlmClient;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  timeoutMs: number;
}): Promise<StructuredResult<T>> {
  const maxOutputTokens = Math.min(MAX_OUTPUT_CAP, args.maxTokens * OUTPUT_HEADROOM);
  const httpOptions = { timeout: args.timeoutMs };
  const base = { model: args.model, contents: args.user };

  // Our tasks are short extraction/planning jobs: reasoning at the model's default depth can take longer
  // than the timeout, so cap it. Models that don't accept a thinking level get the plain request instead.
  const thinking = { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  const send = (config: NonNullable<GenerateContentParameters["config"]>) => args.client.models.generateContent({ ...base, config });
  const jsonConfig = { systemInstruction: args.system, maxOutputTokens, httpOptions, responseMimeType: "application/json", responseJsonSchema: toApiSchema(args.schema) };

  let res: GenerateContentResponse;
  try {
    try {
      res = await send({ ...jsonConfig, ...thinking });
    } catch (e) {
      if (looksLikeThinkingRejection(e)) res = await send(jsonConfig);
      else if (looksLikeSchemaRejection(e)) res = await send({ systemInstruction: args.system + JSON_ONLY, maxOutputTokens, httpOptions, ...thinking });
      else throw e;
    }
  } catch (e) {
    throw mapApiError(e);
  }

  if (res.promptFeedback?.blockReason) throw aiError("refused");
  const finish = res.candidates?.[0]?.finishReason as string | undefined;
  if (finish && ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"].includes(finish)) throw aiError("refused");
  if (finish === "MAX_TOKENS") throw aiError("truncated");

  let raw: unknown;
  try {
    raw = parseJson(textOf(res));
  } catch {
    throw aiError("invalid_output");
  }
  const parsed = args.schema.safeParse(raw);
  if (!parsed.success) throw aiError("invalid_output");

  const u = res.usageMetadata;
  return {
    data: parsed.data,
    model: res.modelVersion ?? args.model,
    usage: {
      inputTokens: u?.promptTokenCount ?? 0,
      outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
      cacheReadTokens: u?.cachedContentTokenCount ?? 0,
    },
  };
}
