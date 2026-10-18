"use client";

import Button from "@mui/material/Button";
import { useMemo, useState } from "react";
import { addDays, relativeDateLabel } from "@/lib/dates";
import { MoveForm } from "@/features/tasks/components/move-form";
import { Popover } from "@/features/tasks/components/popover";
import { useTaskStore } from "@/features/tasks/use-task-store";
import type { TaskItem } from "@/features/tasks/types";
import { isUnfinished } from "@/features/tasks/metrics";
import { recommendCarryForward } from "../review";

/** Act on unfinished work straight from the review: carry forward, finish, or mark incomplete. */
export function ReviewActions({ items, today, asOf }: { items: TaskItem[]; today: string; asOf: string }) {
  const store = useTaskStore(items, today);
  const recs = useMemo(() => recommendCarryForward(store.items, asOf), [store.items, asOf]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = picked ?? new Set(recs.filter((r) => r.recommended).map((r) => r.item.id));
  const ids = recs.filter((r) => selected.has(r.item.id)).map((r) => r.item.id);
  const toggle = (id: string) => setPicked(() => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tomorrow = addDays(today, 1);

  const move = async (date: string, keepTime = true, reason: string | null = null) => {
    setBusy(true);
    await store.reschedule({ ids, date, keepTime, reason });
    setBusy(false);
  };

  if (recs.length === 0) return <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-ink-muted">Nothing left unfinished.</p>;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <ul className="divide-y divide-line">
        {recs.map(({ item, recommended, reasons }) => (
          <li key={item.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="size-4 accent-[var(--color-accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.title}</span>
                <span className="block text-xs text-ink-muted">
                  {relativeDateLabel(item.scheduledDate, today)}
                  {item.originalDate !== item.scheduledDate ? ` · carried before (from ${item.originalDate})` : ""}
                  {recommended ? ` · suggested: ${reasons.join(", ")}` : " · not suggested"}
                </span>
              </span>
              <span className="text-xs text-ink-muted">{item.priority}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
        <span className="text-xs text-ink-muted">{ids.length} selected</span>
        <Button size="small" variant="contained" disabled={busy || ids.length === 0} onClick={() => void move(tomorrow)}>Carry to tomorrow</Button>
        <Popover
          label="Pick a date"
          trigger={(p) => (<Button {...p} data-popover-trigger size="small" variant="outlined" color="inherit" disabled={ids.length === 0} sx={{ borderColor: "divider" }}>Pick date…</Button>)}
        >
          {(close) => <MoveForm today={today} count={ids.length} busy={busy} onSubmit={(c) => { close(); void move(c.date, c.keepTime, c.reason); }} />}
        </Popover>
        <Button size="small" variant="outlined" color="inherit" disabled={ids.length === 0} onClick={() => void store.setStatusMany(ids, "done")} sx={{ borderColor: "divider" }}>Mark done</Button>
        <Button size="small" variant="outlined" color="inherit" disabled={ids.length === 0} onClick={() => void store.setStatusMany(ids, "incomplete")} sx={{ borderColor: "divider" }}>Mark incomplete</Button>
      </div>
    </div>
  );
}

export const countUnfinished = (items: TaskItem[]) => items.filter(isUnfinished).length;
