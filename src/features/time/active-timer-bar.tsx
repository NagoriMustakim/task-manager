"use client";

import Button from "@mui/material/Button";
import { formatClock } from "@/lib/time";
import { useTimer } from "./timer-context";

/** Global running-timer indicator with Stop, visible on every page. */
export function ActiveTimerBar() {
  const { active, elapsedSeconds, stop, busy } = useTimer();
  if (!active) return null;
  return (
    <div role="status" className="fixed bottom-[8.5rem] left-3 right-3 z-30 flex items-center gap-3 rounded-xl border border-line-strong bg-surface px-3 py-2 shadow-lg md:bottom-4 md:left-auto md:right-4 md:w-72">
      <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-danger" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{active.title}</p>
        <p className="text-xs tabular-nums text-ink-muted">Tracking · {formatClock(elapsedSeconds)}</p>
      </div>
      <Button size="small" variant="contained" color="error" onClick={() => void stop()} disabled={busy}>Stop</Button>
    </div>
  );
}
