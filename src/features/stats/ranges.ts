import { addDays, daysBetween, daysInMonth, isIsoDate, weekdayOf } from "@/lib/dates";

export const PRESETS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<Preset, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This week", last_week: "Last week", this_month: "This month", last_month: "Last month", custom: "Custom",
};
export interface Range { from: string; to: string }
export const MAX_RANGE_DAYS = 366;

const monthOf = (ym: string): Range => ({ from: `${ym}-01`, to: `${ym}-${String(daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))).padStart(2, "0")}` });
const prevMonth = (ym: string) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

/** Weeks run Monday to Sunday. Returns null for an invalid custom range. */
export function resolveRange(preset: Preset, today: string, custom?: { from?: string | undefined; to?: string | undefined }): Range | null {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": { const y = addDays(today, -1); return { from: y, to: y }; }
    case "this_week": return { from: monday, to: addDays(monday, 6) };
    case "last_week": return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "this_month": return monthOf(today.slice(0, 7));
    case "last_month": return monthOf(prevMonth(today.slice(0, 7)));
    case "custom":
      if (!isIsoDate(custom?.from) || !isIsoDate(custom?.to) || custom.from > custom.to) return null;
      return daysBetween(custom.from, custom.to) + 1 > MAX_RANGE_DAYS ? null : { from: custom.from, to: custom.to };
  }
}

export const parsePreset = (v: string | undefined): Preset => ((PRESETS as readonly string[]).includes(v ?? "") ? (v as Preset) : "this_week");
