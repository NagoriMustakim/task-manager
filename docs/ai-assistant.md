# AI productivity assistant (Google Gemini)

Migration: `20261018180000_ai_foundation.sql` (working hours, `ai_usage`, `ai_cache`, rate-limit functions). Apply it before using AI features.

## Setup
| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server-only. Never `NEXT_PUBLIC_`. |
| `GEMINI_MODEL` | yes | **No default is hardcoded.** Use a Gemini model ID your key can call (https://ai.google.dev/gemini-api/docs/models). `.env` ships with `gemini-3.8-flash`; if you get a key/model error try `gemini-3.5-flash-lite`. Invalid or unavailable models surface as a clear "check key/model" message. |
| `AI_RATE_LIMIT_PER_HOUR` / `_PER_DAY` | no | Per user. Defaults 20 / 100. |
| `AI_TIMEOUT_MS` | no | Default 45000. |
| `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK` | no | Your own pricing; when both are set Settings shows an estimated cost. Without them only tokens are shown (no guessed prices). |

Local: put them in `.env.local` (git-ignored) and restart `pnpm dev`. Vercel: Project → Settings → Environment Variables → add for Production/Preview (leave "Sensitive" on), redeploy. If either variable is missing, the app works normally; AI panels show a setup message and Settings lists which variable names are missing.

## What it does (all optional, all suggestions)
Daily-planner panel: **plan the day** (fits tasks into your working hours around timed commitments, flags overload, proposes deferrals), **carry-forward advice** (today / tomorrow / later with reasons and capacity), **describe a task** (sentence → editable draft). Task details: **suggest subtasks** (add as checklist or as tasks). Analytics: **explain these numbers**. Daily/weekly review: **end-of-day summary**, **weekly narrative**. Nothing is applied without pressing Accept/Create; you can edit times/dates/titles first or dismiss. There is no AI call on status changes or page loads: only when you press a button.

## Architecture (`src/features/ai/`)
`actions.ts` (input validation, safe errors) → `service.ts` (authorisation → authorised data retrieval → server-computed metrics → prompt → model → validation → formatting) with `authz.ts`, `facts.ts` (minimised facts, metrics dictionary), `prompts.ts`, `payload.ts` (untrusted-data handling), `structured.ts` (Gemini call via `@google/genai`, JSON mode + Zod validation), `postprocess.ts` (re-validation of refs/dates/times), `usage.ts` (rate limit, metering, cache), `client.ts` (server-only Gemini client).

## Privacy
- Default context is the signed-in user's own data. Another user's data is used only for insights / end-of-day / weekly requests by an **administrator holding an `admin_user_access` grant**; `authorizeSubject` checks this before any retrieval, and queries filter by `user_id` explicitly (RLS alone is not relied on).
- The model gets a compact summary: refs (`t1…`) instead of ids, trimmed titles, priority/status/estimate/deadline/times, counts and server-computed metrics. No notes, ids, emails or full history. Insights send metrics, not task lists.
- Task text is treated as untrusted: sanitised, length-capped, JSON-encoded with `< > &` escaped inside a `<task_data>` block, with a system prompt that says wrapped content is data. Model output is Zod-validated and then re-checked: unknown refs, out-of-hours or overlapping blocks, impossible dates and unsupported metric references are dropped. The model can only produce suggestions; all changes go through the existing user-confirmed actions.
- Prompts and responses are not logged. `ai_usage` stores feature, model, token counts, status, optional cost; `ai_cache` stores the validated output for the owner only (not readable by administrators).

## Cost and reliability
Per-user hourly/daily limits enforced atomically in the database (`ai_reserve_call`); identical requests within 10–60 minutes are served from `ai_cache` (key includes feature, model, subject and the exact data sent, so any task change misses the cache); capped input sizes (≤40 tasks) and `max_tokens`; request timeout; SDK retries for transient errors; clear errors (not configured, rate limited with retry time, busy, timeout, key/model rejected, refusal, truncated, unusable output). Gemini reasoning tokens count against the output limit, so requests allow 3x headroom and reasoning tokens are included in usage. If the model rejects the JSON schema the call is retried once with a JSON-only instruction.

## Verification
Executed: `pnpm test` (200 tests) with a **mocked** Gemini client, no API calls: valid/invalid/truncated/refused responses, SDK error mapping, structured-output fallback, request shape (no key/sampling fields), rate-limit reservation, usage records contain no content, missing configuration, injection attempts (wrapper break-out, hallucinated refs/ids), authorisation boundaries, caching keys, data minimisation, metrics dictionary. Typecheck and build.

**Not executed:** real model calls (needs your key), the database functions/policies, and the UI in a browser. To try it: add your key from https://aistudio.google.com/apikey to `GEMINI_API_KEY` in `.env`, restart `pnpm dev`, apply the migration, open Today → "AI assistant".
