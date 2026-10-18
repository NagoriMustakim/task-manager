import { addDays, daysBetween, isIsoDate } from "@/lib/dates";
import { buildRanges } from "@/features/time/stats";
import { monthRange, yearRange, type DateRange } from "@/lib/ranges";

export const PRESETS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "last_year", "custom"] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<Preset, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This week", last_week: "Last week",
  this_month: "This month", last_month: "Last month", this_year: "This year", last_year: "Last year", custom: "Custom",
};
export const MAX_CUSTOM_DAYS = 1830; // ~5 years

export type Granularity = "hour" | "day" | "month";

const prevMonth = (m: string) => {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};

/** Resolves a preset (or custom bounds) to inclusive local calendar dates. Returns null for invalid custom input. */
export function resolveRange(preset: Preset, today: string, weekStartDay: number, custom?: { from?: string | undefined; to?: string | undefined }): DateRange | null {
  const r = buildRanges(today, weekStartDay);
  switch (preset) {
    case "today": return r.today;
    case "yesterday": return r.yesterday;
    case "this_week": return r.week;
    case "last_week": return { from: addDays(r.week.from, -7), to: addDays(r.week.from, -1) };
    case "this_month": return r.month;
    case "last_month": return monthRange(prevMonth(today.slice(0, 7)));
    case "this_year": return r.year;
    case "last_year": return yearRange(Number(today.slice(0, 4)) - 1);
    case "custom": {
      if (!isIsoDate(custom?.from) || !isIsoDate(custom?.to) || custom.from > custom.to) return null;
      return daysBetween(custom.from, custom.to) + 1 > MAX_CUSTOM_DAYS ? null : { from: custom.from, to: custom.to };
    }
  }
}

export const rangeDays = (r: DateRange) => daysBetween(r.from, r.to) + 1;

export function granularityFor(r: DateRange): Granularity {
  const d = rangeDays(r);
  return d === 1 ? "hour" : d <= 92 ? "day" : "month";
}

/** The period immediately before, same length (calendar months/weeks/years stay aligned for the presets). */
export function previousRange(r: DateRange, preset: Preset): DateRange {
  const len = rangeDays(r);
  if (preset === "this_month" || preset === "last_month") return monthRange(prevMonth(r.from.slice(0, 7)));
  if (preset === "this_year" || preset === "last_year") return yearRange(Number(r.from.slice(0, 4)) - 1);
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export function parsePreset(v: string | undefined): Preset {
  return (PRESETS as readonly string[]).includes(v ?? "") ? (v as Preset) : "this_week";
}
