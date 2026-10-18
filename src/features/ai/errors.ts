export type AiErrorCode =
  | "not_configured" | "rate_limited" | "forbidden" | "invalid_input" | "auth" | "timeout"
  | "overloaded" | "upstream" | "refused" | "truncated" | "invalid_output" | "unauthenticated";

/** Safe to show to users: never contains keys, prompts or task content. */
export class AiError extends Error {
  constructor(public code: AiErrorCode, public userMessage: string, public retryAfterSeconds?: number) {
    super(userMessage);
    this.name = "AiError";
  }
}

export const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "AI features aren't set up yet. Add GEMINI_API_KEY and GEMINI_MODEL to the server environment.",
  rate_limited: "You've reached the AI request limit. Try again later.",
  forbidden: "You don't have access to that user's data.",
  invalid_input: "That request wasn't valid.",
  auth: "The AI provider rejected the server's credentials. Check GEMINI_API_KEY and that it can use GEMINI_MODEL.",
  timeout: "The AI request timed out. Try again.",
  overloaded: "The AI service is busy right now. Try again in a moment.",
  upstream: "The AI request failed. Try again.",
  refused: "The assistant declined to answer that request.",
  truncated: "The assistant's answer was cut off. Try again, or with less data.",
  invalid_output: "The assistant returned an answer that couldn't be used. Try again.",
  unauthenticated: "Your session has ended. Sign in again.",
};

export const aiError = (code: AiErrorCode, retryAfterSeconds?: number) => new AiError(code, MESSAGES[code], retryAfterSeconds);
