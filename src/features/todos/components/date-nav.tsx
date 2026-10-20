"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/ui/fields";
import { addDays, isIsoDate } from "@/lib/dates";
import { IconLeft, IconRight } from "./icons";

const btn = "flex size-9 items-center justify-center rounded-control border border-line-strong hover:bg-line/50";

/** Previous / next day, jump to any day, or back to today. */
export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const href = (d: string) => (d === today ? "/today" : `/today?date=${d}`);
  return (
    <nav aria-label="Change day" className="flex items-center gap-1.5">
      <Link href={href(addDays(date, -1))} className={btn} aria-label="Previous day"><IconLeft /></Link>
      <DateField aria-label="Jump to day" value={date} onChange={(d) => { if (isIsoDate(d)) router.push(href(d)); }} />
      <Link href={href(addDays(date, 1))} className={btn} aria-label="Next day"><IconRight /></Link>
      {date !== today ? <Link href="/today" className="h-9 rounded-control border border-line-strong px-3 text-[13px] leading-9 hover:bg-line/50">Today</Link> : null}
    </nav>
  );
}
