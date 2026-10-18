"use client";

import Button from "@mui/material/Button";
import { useState } from "react";
import { archiveTaskAction } from "../actions";
import { PRIORITY_LABEL, type TaskPriority } from "../types";
import { PRIORITY_BAR, PRIORITY_CHIP } from "./priority-style";
import { useToast } from "./toast";

export interface ArchivedTask { id: string; title: string; priority: TaskPriority; archivedAt: string; category: string | null; repeats: boolean }

export function ArchivedList({ initial }: { initial: ArchivedTask[] }) {
  const [tasks, setTasks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const { notify } = useToast();

  const restore = async (t: ArchivedTask) => {
    setBusy(t.id);
    const r = await archiveTaskAction(t.id, false);
    setBusy(null);
    if (!r.ok) { notify(r.error, { tone: "error" }); return; }
    setTasks((l) => l.filter((x) => x.id !== t.id));
    notify(`Restored “${t.title}”`);
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="font-medium">No archived tasks</p>
        <p className="mt-1 text-ink-muted">Tasks you archive from the list show up here, and can be restored.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface py-3 pl-5 pr-3">
          <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_BAR[t.priority]}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              <span className={`inline-flex h-6 items-center rounded-full border px-2.5 font-semibold ${PRIORITY_CHIP[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
              {t.category ? <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5">{t.category}</span> : null}
              {t.repeats ? <span>↻ Repeating</span> : null}
              <span>Archived {new Date(t.archivedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <Button size="small" variant="outlined" disabled={busy === t.id} onClick={() => void restore(t)}>{busy === t.id ? "Restoring…" : "Restore"}</Button>
        </li>
      ))}
    </ul>
  );
}
