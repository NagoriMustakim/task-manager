import { addDays, daysBetween, daysInMonth, weekdayOf } from "./dates";

/**
 * Recurrence is expressed as a small RRULE subset and evaluated purely on calendar dates
 * ("YYYY-MM-DD") so it is unaffected by DST or timezone changes: an occurrence is always
 * "that calendar day", and any time of day is stored as a wall-clock time.
 *
 *   FREQ=DAILY|WEEKLY|MONTHLY ; INTERVAL=n ; BYDAY=MO,TU,... (weekly) ; BYMONTHDAY=1..31 (monthly)
 *
 * Monthly rules on a day the month lacks (e.g. the 31st) fall on the month's last day.
 */
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";
export interface Rule {
  freq: Freq;
  interval: number;
  byday: number[]; // 0=Sunday … 6=Saturday (weekly)
  bymonthday: number | null; // monthly
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function serializeRule(r: Rule): string {
  const parts = [`FREQ=${r.freq}`, `INTERVAL=${r.interval}`];
  if (r.freq === "WEEKLY" && r.byday.length) parts.push(`BYDAY=${[...new Set(r.byday)].sort().map((d) => DAY_CODES[d]).join(",")}`);
  if (r.freq === "MONTHLY" && r.bymonthday) parts.push(`BYMONTHDAY=${r.bymonthday}`);
  return parts.join(";");
}

export function parseRule(text: string): Rule | null {
  const m = /^FREQ=(DAILY|WEEKLY|MONTHLY)((?:;(?:INTERVAL|BYDAY|BYMONTHDAY)=[A-Z0-9,]+)*)$/.exec(text);
  if (!m) return null;
  const rule: Rule = { freq: m[1] as Freq, interval: 1, byday: [], bymonthday: null };
  for (const part of m[2]!.split(";").filter(Boolean)) {
    const [k, v] = part.split("=") as [string, string];
    if (k === "INTERVAL") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 365) return null;
      rule.interval = n;
    } else if (k === "BYDAY") {
      const days = v.split(",").map((c) => DAY_CODES.indexOf(c as (typeof DAY_CODES)[number]));
      if (days.some((d) => d < 0)) return null;
      rule.byday = days;
    } else if (k === "BYMONTHDAY") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 31) return null;
      rule.bymonthday = n;
    }
  }
  return rule;
}

export type Preset = "daily" | "weekdays" | "weekly" | "monthly";

export function presetRule(preset: Preset, startDate: string): Rule {
  switch (preset) {
    case "daily": return { freq: "DAILY", interval: 1, byday: [], bymonthday: null };
    case "weekdays": return { freq: "WEEKLY", interval: 1, byday: [1, 2, 3, 4, 5], bymonthday: null };
    case "weekly": return { freq: "WEEKLY", interval: 1, byday: [weekdayOf(startDate)], bymonthday: null };
    case "monthly": return { freq: "MONTHLY", interval: 1, byday: [], bymonthday: Number(startDate.slice(8, 10)) };
  }
}

export function describeRule(text: string): string {
  const r = parseRule(text);
  if (!r) return "Repeats";
  const every = (unit: string) => (r.interval === 1 ? unit : `${r.interval} ${unit}s`);
  if (r.freq === "DAILY") return r.interval === 1 ? "Every day" : `Every ${r.interval} days`;
  if (r.freq === "WEEKLY") {
    const days = [...r.byday].sort();
    const isWeekdays = days.join() === "1,2,3,4,5";
    const label = isWeekdays ? "weekdays" : days.map((d) => DAY_NAMES[d]!.slice(0, 3)).join(", ");
    return r.interval === 1 ? `Every ${isWeekdays ? "weekday" : "week"}${isWeekdays || !label ? "" : ` on ${label}`}` : `Every ${every("week")}${label ? ` on ${label}` : ""}`;
  }
  return `Every ${r.interval === 1 ? "month" : `${r.interval} months`}${r.bymonthday ? ` on day ${r.bymonthday}` : ""}`;
}

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1);
}

function occursOn(rule: Rule, start: string, date: string): boolean {
  if (date < start) return false;
  switch (rule.freq) {
    case "DAILY":
      return daysBetween(start, date) % rule.interval === 0;
    case "WEEKLY": {
      const days = rule.byday.length ? rule.byday : [weekdayOf(start)];
      if (!days.includes(weekdayOf(date))) return false;
      // Weeks start on Monday; the week containing `start` is week 0.
      const startMonday = addDays(start, -((weekdayOf(start) + 6) % 7));
      const week = Math.floor(daysBetween(startMonday, date) / 7);
      return week % rule.interval === 0;
    }
    case "MONTHLY": {
      if ((monthIndex(date) - monthIndex(start)) % rule.interval !== 0) return false;
      const want = rule.bymonthday ?? Number(start.slice(8, 10));
      const y = Number(date.slice(0, 4));
      const mo = Number(date.slice(5, 7));
      return Number(date.slice(8, 10)) === Math.min(want, daysInMonth(y, mo));
    }
  }
}

/**
 * Dates on which the rule occurs within [from, to] (inclusive), never before `start` and
 * never after `until`. `maxDays` bounds the scan so generation can never be unbounded.
 */
export function occurrenceDates(
  rule: Rule,
  opts: { start: string; from: string; to: string; until?: string | null; maxDays?: number },
): string[] {
  const maxDays = opts.maxDays ?? 500;
  const first = opts.from > opts.start ? opts.from : opts.start;
  let last = opts.until && opts.until < opts.to ? opts.until : opts.to;
  if (daysBetween(first, last) >= maxDays) last = addDays(first, maxDays - 1);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) if (occursOn(rule, opts.start, d)) out.push(d);
  return out;
}
