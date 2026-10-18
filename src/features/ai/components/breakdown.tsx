"use client";

import { useState } from "react";
import type { TaskItem } from "@/features/tasks/types";
import type { useTaskStore } from "@/features/tasks/use-task-store";
import { aiBreakdownAction } from "../actions";
import { AI_NOTE, AiButton, AiError, useAiCall } from "./ai-ui";

type Store = ReturnType<typeof useTaskStore>;

/** Suggests subtasks; the person picks which to keep, then adds them to the description or creates tasks. */
export function BreakdownSuggest({ item, store, configured }: { item: TaskItem; store: Store; configured: boolean }) {
  const call = useAiCall(aiBreakdownAction);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  if (!configured) return <p className="text-[11px] text-ink-muted">Task breakdown needs the AI assistant to be set up.</p>;
  const subs = call.data?.subtasks ?? [];
  const chosen = subs.map((s, i) => ({ ...s, title: (titles[i] ?? s.title).trim() })).filter((_, i) => picked.has(i));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AiButton pending={call.pending} onClick={() => { setPicked(new Set()); setTitles({}); call.run({ occurrenceId: item.id }); }}>Suggest subtasks</AiButton>
        <span className="text-[11px] text-ink-muted">{AI_NOTE}</span>
      </div>
      <AiError message={call.error} />
      {subs.length ? (
        <>
          <ul className="space-y-1">
            {subs.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} aria-label={`Keep: ${s.title}`} className="size-4 accent-[var(--color-accent)]" />
                <input value={titles[i] ?? s.title} maxLength={140} onChange={(e) => setTitles((t) => ({ ...t, [i]: e.target.value }))} aria-label="Subtask" className="h-7 min-w-0 flex-1 rounded-control border border-line px-2 text-sm" />
                {s.estimatedMinutes ? <span className="text-xs text-ink-muted">{s.estimatedMinutes}m</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={chosen.length === 0} onClick={() => { const md = chosen.map((c) => `- [ ] ${c.title}`).join("\n"); void store.setTask(item.taskId, { notes: [item.notes?.trim(), md].filter(Boolean).join("\n\n") }, "Checklist added"); call.clear(); }} className="h-8 rounded-control bg-accent px-3 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">Add as checklist to description</button>
            <button type="button" disabled={chosen.length === 0 || busy} onClick={async () => { setBusy(true); for (const c of chosen) await store.create({ title: c.title, date: item.scheduledDate, priority: item.priority === "none" ? "medium" : item.priority, estimatedMinutes: c.estimatedMinutes, categoryId: item.categoryId }); setBusy(false); call.clear(); }} className="h-8 rounded-control border border-line-strong px-3 text-xs hover:bg-canvas disabled:opacity-50">{busy ? "Creating…" : "Create as separate tasks"}</button>
            <button type="button" onClick={call.clear} className="h-8 px-2 text-xs text-ink-muted hover:underline">Dismiss</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
