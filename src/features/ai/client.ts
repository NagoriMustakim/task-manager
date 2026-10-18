import "server-only";
import { GoogleGenAI } from "@google/genai";
import { readAiConfig, type AiConfig } from "./config";
import { aiError } from "./errors";
import type { LlmClient } from "./structured";

let cached: { key: string; client: GoogleGenAI } | null = null;

export function getAiStatus(): { configured: boolean; missing: string[] } {
  const r = readAiConfig(process.env);
  return r.configured ? { configured: true, missing: [] } : { configured: false, missing: r.missing };
}

/** Server-only Gemini client. The key is read from the environment and never leaves this process. */
export function getAiRuntime(): { config: AiConfig; client: LlmClient } {
  const r = readAiConfig(process.env);
  if (!r.configured) throw aiError("not_configured");
  if (!cached || cached.key !== r.config.apiKey) cached = { key: r.config.apiKey, client: new GoogleGenAI({ apiKey: r.config.apiKey }) };
  return { config: r.config, client: cached.client };
}
