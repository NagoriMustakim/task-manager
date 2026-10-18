"use client";

import Button from "@mui/material/Button";
import Link from "next/link";
import { DateField } from "@/components/ui/fields";
import { PRESETS, PRESET_LABEL, type Preset } from "../ranges";

/** Presets are plain links (shareable URLs, no JS needed); custom is a GET form. */
export function RangeFilter({ active, from, to, basePath = "/analytics" }: { active: Preset; from: string; to: string; basePath?: string }) {
  const pill = "h-8 shrink-0 rounded-full border border-line-strong px-3.5 text-xs leading-[30px] hover:bg-canvas aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:font-medium aria-[current=true]:text-on-accent";
  return (
    <div className="mb-5 space-y-2">
      <nav aria-label="Date range" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={`${basePath}?range=${p}`} aria-current={active === p} className={pill}>{PRESET_LABEL[p]}</Link>
        ))}
      </nav>
      <form action={basePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <DateField label="From" name="from" defaultValue={from} required sx={{ width: 170 }} />
        <DateField label="To" name="to" defaultValue={to} required sx={{ width: 170 }} />
        <Button type="submit" variant={active === "custom" ? "contained" : "outlined"} sx={{ height: 40 }}>Apply custom range</Button>
      </form>
    </div>
  );
}
