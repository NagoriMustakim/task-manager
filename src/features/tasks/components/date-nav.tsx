"use client";

import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/ui/fields";
import { addDays, isIsoDate } from "@/lib/dates";

export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const href = (d: string) => (d === today ? "/today" : `/today?date=${d}`);
  return (
    <nav aria-label="Change day" className="flex items-center gap-1">
      <IconButton component={Link} href={href(addDays(date, -1))} aria-label="Previous day" size="small"><ChevronLeftRounded /></IconButton>
      <DateField aria-label="Jump to date" value={date} onChange={(v) => { if (isIsoDate(v)) router.push(href(v)); }} sx={{ width: 156 }} />
      <IconButton component={Link} href={href(addDays(date, 1))} aria-label="Next day" size="small"><ChevronRightRounded /></IconButton>
      {date !== today ? <Button component={Link} href="/today" variant="outlined" size="small">Today</Button> : null}
    </nav>
  );
}
