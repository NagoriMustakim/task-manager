import { z } from "zod";

const instant = z.string().datetime({ offset: true });
export const MAX_ENTRY_MS = 24 * 3600 * 1000;
const FUTURE_SLACK_MS = 60_000;

export interface Clock { now: number }

const entryRules = (v: { startedAt: string; endedAt: string }, clock: Clock) => {
  const s = Date.parse(v.startedAt), e = Date.parse(v.endedAt);
  if (e <= s) return "End must be after start.";
  if (e > clock.now + FUTURE_SLACK_MS) return "End can't be in the future.";
  if (e - s > MAX_ENTRY_MS) return "An entry can be at most 24 hours.";
  return null;
};

export const entrySchema = z.object({
  startedAt: instant,
  endedAt: instant,
  note: z.string().trim().max(500).nullish(),
});

/** Client-side/server-side pre-validation mirroring the database rules (the DB is authoritative). */
export function validateEntry(v: { startedAt: string; endedAt: string }, now = Date.now()): string | null {
  return entryRules(v, { now });
}

export const addEntrySchema = entrySchema.extend({ occurrenceId: z.string().uuid() });
export const updateEntrySchema = entrySchema.extend({ id: z.string().uuid() });
export const stopSchema = z.object({ sessionId: z.string().uuid().nullish(), endedAt: instant.nullish() });
export const startSchema = z.object({ occurrenceId: z.string().uuid() });
