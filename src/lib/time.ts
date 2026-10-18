import { addDays, dateInZone } from "./dates";

/** UTC offset (minutes, east positive) of `timeZone` at the given instant. */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` `time` ("YYYY-MM-DD", "HH:MM").
 * DST gap (nonexistent time) resolves to the first valid instant after the gap; an ambiguous
 * time (fall-back) resolves to its first occurrence.
 */
export function localToInstant(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall - tzOffsetMinutes(new Date(wall), timeZone) * 60_000;
  // Re-evaluate the offset at the guess (handles instants near a transition).
  const off2 = tzOffsetMinutes(new Date(guess), timeZone);
  guess = wall - off2 * 60_000;
  const off3 = tzOffsetMinutes(new Date(guess), timeZone);
  if (off3 !== off2) guess = wall - Math.min(off2, off3) * 60_000; // earliest of an ambiguous pair / forward over a gap
  return new Date(guess);
}

export function instantToLocal(instant: Date | string, timeZone: string): { date: string; time: string } {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const date = dateInZone(d, timeZone);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
  return { date, time };
}

export const startOfLocalDay = (date: string, timeZone: string) => localToInstant(date, "00:00", timeZone);

/**
 * Splits [start, end) at local midnights of `timeZone`. DST days are 23/25 hours long and
 * still sum exactly to the session length.
 */
export function splitByDay(start: Date, end: Date, timeZone: string): { date: string; seconds: number }[] {
  const out: { date: string; seconds: number }[] = [];
  if (end <= start) return out;
  let date = dateInZone(start, timeZone);
  let cursor = start;
  for (let guard = 0; cursor < end && guard < 400; guard++) {
    const nextMidnight = startOfLocalDay(addDays(date, 1), timeZone);
    const pieceEnd = nextMidnight < end ? nextMidnight : end;
    const seconds = Math.round((pieceEnd.getTime() - cursor.getTime()) / 1000);
    if (seconds > 0) out.push({ date, seconds });
    cursor = pieceEnd;
    date = addDays(date, 1);
  }
  return out;
}

/** Whole seconds between two instants, never negative. */
export const secondsBetween = (a: Date | string, b: Date | string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000));

/** 3725 -> "1h 2m"; 45 -> "45s"; 0 -> "0m". */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  if (s < 60) return s === 0 ? "0m" : `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** 3725 -> "1:02:05" (running clock). */
export function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
