"use client";

import { formatClock, formatSeconds } from "@/lib/time";
import { TimeEntries } from "@/features/time/time-entries";
import { useTimer } from "@/features/time/timer-context";
import type { TaskItem } from "../types";
import { IconClock } from "./icons";
import { Popover } from "./popover";

/** Compact start/stop button with live elapsed time. Elapsed comes from the persisted start timestamp. */
export function TimerButton({ item }: { item: TaskItem }) {
  const t = useTimer();
  const running = t.active?.occurrenceId === item.id;
  const blocked = Boolean(item.movedToId) || item.status === "done";
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={t.busy || (blocked && !running)}
        aria-pressed={running}
        aria-label={running ? `Stop timer for ${item.title}` : `Start timer for ${item.title}`}
        title={blocked && !running ? "Reopen the task to start a timer (you can still add time manually)" : running ? "Stop timer" : "Start timer"}
        onClick={() => void (running ? t.stop() : t.start({ occurrenceId: item.id, taskId: item.taskId, title: item.title }))}
        className={`flex size-8 items-center justify-center rounded-full ${running ? "bg-danger text-canvas" : "text-ink-muted hover:bg-canvas hover:text-ink"} disabled:opacity-40`}
      >
        {running ? <span aria-hidden className="size-2.5 rounded-[2px] bg-canvas" /> : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>}
      </button>
      {running ? <span className="text-xs font-medium tabular-nums text-danger">{formatClock(t.elapsedSeconds)}</span> : null}
    </span>
  );
}

/** Recorded time (finished sessions only) vs estimate, with the entries editor behind it. */
export function TimeChip({ item }: { item: TaskItem }) {
  const estimate = item.estimatedMinutes ? item.estimatedMinutes * 60 : null;
  const over = estimate !== null && item.trackedSeconds > estimate;
  return (
    <Popover
      label="Time entries"
      trigger={(p) => (
        <button
          {...p}
          data-popover-trigger
          className={`inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-xs hover:border-line-strong hover:bg-canvas aria-expanded:border-line-strong ${over ? "border-pri-high/50 text-pri-high" : "text-ink-muted"}`}
          aria-label={`Recorded ${formatSeconds(item.taskTrackedSeconds)} in total, ${formatSeconds(item.trackedSeconds)} on this entry. Open time entries`}
          title={`Recorded on this entry: ${formatSeconds(item.trackedSeconds)}${estimate ? ` · estimate ${formatSeconds(estimate)}` : ""}`}
        >
          <IconClock width={12} height={12} />
          {formatSeconds(item.taskTrackedSeconds)} recorded
        </button>
      )}
    >
      {() => <TimeEntries taskId={item.taskId} occurrenceId={item.id} />}
    </Popover>
  );
}
