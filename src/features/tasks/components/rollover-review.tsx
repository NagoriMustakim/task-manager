"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { markReviewedAction } from "../actions";
import { addDays, relativeDateLabel } from "@/lib/dates";
import type { TaskItem } from "../types";
import type { useTaskStore } from "../use-task-store";
import { MoveForm } from "./move-form";
import { Popover } from "./popover";

type Store = ReturnType<typeof useTaskStore>;

/**
 * Day-rollover review. Nothing is changed automatically: the user picks, per task, to carry
 * forward, mark incomplete, or leave pending (just don't select it). "Done reviewing" records
 * that today's review is finished; unfinished tasks remain visible under Overdue either way.
 */
export function RolloverReview({
  open, onClose, items, store, today, onReviewed,
}: { open: boolean; onClose: () => void; items: TaskItem[]; store: Store; today: string; onReviewed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setPicked(new Set(items.map((i) => i.id))); }
    if (!open && d.open) d.close();
  }, [open, items]);
  useEffect(() => {
    const d = ref.current;
    const h = () => onClose();
    d?.addEventListener("close", h);
    return () => d?.removeEventListener("close", h);
  }, [onClose]);

  const groups = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const i of items) m.set(i.scheduledDate, [...(m.get(i.scheduledDate) ?? []), i]);
    return [...m].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [items]);

  const ids = items.filter((i) => picked.has(i.id)).map((i) => i.id);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const finish = async () => { await markReviewedAction(); onReviewed(); onClose(); };
  const move = async (date: string, keepTime = true, reason: string | null = null) => {
    setBusy(true);
    await store.reschedule({ ids, date, keepTime, reason });
    setBusy(false);
  };

  return (
    <dialog
      ref={ref}
      aria-label="Review unfinished tasks"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-xl border border-line-strong bg-surface p-0 shadow-xl backdrop:bg-black/40 text-ink"
    >
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">Review unfinished tasks</h2>
        <p className="mt-0.5 text-[13px] text-ink-muted">Nothing changes until you choose. Tasks you leave unselected stay pending.</p>
      </div>
      <div className="max-h-[50dvh] overflow-y-auto px-3 py-2">
        {items.length === 0 ? <p className="px-2 py-6 text-center text-ink-muted">All caught up.</p> : null}
        {groups.map(([d, list]) => (
          <section key={d} className="mb-2">
            <h3 className="px-2 py-1 text-xs font-medium text-ink-muted">{relativeDateLabel(d, today)}</h3>
            <ul>
              {list.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 hover:bg-canvas">
                    <Checkbox size="small" checked={picked.has(i.id)} onChange={() => toggle(i.id)} sx={{ p: 0.5 }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                    {i.startTime ? <span className="text-xs text-ink-muted">{i.startTime}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button size="small" variant="outlined" color="inherit" disabled={busy || ids.length === 0} onClick={() => void move(today)} sx={{ borderColor: "divider" }}>Move to today</Button>
        <Button size="small" variant="contained" disabled={busy || ids.length === 0} onClick={() => void move(addDays(today, 1))}>Move to tomorrow</Button>
        <Popover
          label="Pick a date"
          trigger={(p) => (<Button {...p} data-popover-trigger size="small" variant="outlined" color="inherit" disabled={ids.length === 0} sx={{ borderColor: "divider" }}>Pick date…</Button>)}
        >
          {(close) => <MoveForm today={today} count={ids.length} busy={busy} onSubmit={(c) => { close(); void move(c.date, c.keepTime, c.reason); }} />}
        </Popover>
        <Button size="small" variant="outlined" color="inherit" disabled={busy || ids.length === 0} onClick={() => void store.setStatusMany(ids, "incomplete")} sx={{ borderColor: "divider" }}>Mark incomplete</Button>
        <Button size="small" color="inherit" onClick={() => void finish()} sx={{ ml: "auto" }}>Done reviewing</Button>
      </div>
    </dialog>
  );
}
