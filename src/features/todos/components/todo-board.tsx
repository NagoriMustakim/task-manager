"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import { addDays, formatLongDate, relativeDateLabel } from "@/lib/dates";
import { deleteTodoAction, moveTodosAction, updateTodoAction } from "../actions";
import { compareTodos, isOpen, type Todo } from "../types";
import { Composer } from "./composer";
import { TodoRow, type Change } from "./todo-row";

export type BoardMode = { kind: "day"; date: string } | { kind: "upcoming" } | { kind: "all" };

/** Interactive task list. Changes appear immediately and are rolled back with a message if the server rejects them. */
export function TodoBoard({ initial, today, mode, emptyTitle, emptyHint }: { initial: Todo[]; today: string; mode: BoardMode; emptyTitle: string; emptyHint: string }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => setItems(initial), [initial]);

  const change = async (id: string, c: Change) => {
    const prev = items.find((t) => t.id === id);
    if (!prev) return;
    setError(null);
    setItems((l) => l.map((t) => (t.id === id ? { ...t, ...c } : t)));
    const r = await updateTodoAction(id, c);
    if (!r.ok) {
      setItems((l) => l.map((t) => (t.id === id ? prev : t)));
      setError(r.error);
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setError(null);
    setItems((l) => l.filter((t) => t.id !== id));
    const r = await deleteTodoAction(id);
    if (!r.ok) { setItems(prev); setError(r.error); }
  };

  const { overdue, groups, dayItems } = useMemo(() => {
    const sorted = [...items].sort(compareTodos);
    if (mode.kind === "day") {
      const day = sorted.filter((t) => t.date === mode.date);
      const over = mode.date === today ? sorted.filter((t) => isOpen(t.status) && t.date < today) : [];
      return { overdue: over, groups: [{ key: mode.date, title: "", items: day }], dayItems: day };
    }
    const list = mode.kind === "upcoming" ? sorted.filter((t) => t.date > today) : [...sorted].reverse().sort((a, b) => (a.date === b.date ? compareTodos(a, b) : a.date < b.date ? 1 : -1));
    const by = new Map<string, Todo[]>();
    for (const t of list) by.set(t.date, [...(by.get(t.date) ?? []), t]);
    return { overdue: [] as Todo[], groups: [...by].map(([d, ts]) => ({ key: d, title: `${relativeDateLabel(d, today)} · ${formatLongDate(d)}`, items: ts })), dayItems: [] as Todo[] };
  }, [items, mode, today]);

  const moveOverdue = async () => {
    const ids = overdue.map((t) => t.id);
    setMoving(true);
    setError(null);
    const prev = items;
    setItems((l) => l.map((t) => (ids.includes(t.id) ? { ...t, date: today } : t)));
    const r = await moveTodosAction(ids, today);
    setMoving(false);
    if (!r.ok) { setItems(prev); setError(r.error); }
  };

  const total = dayItems.length;
  const done = dayItems.filter((t) => t.status === "done").length;
  const empty = groups.every((g) => g.items.length === 0) && overdue.length === 0;
  // New tasks default to a day that is visible in the current view.
  const composerDate = mode.kind === "day" ? mode.date : mode.kind === "upcoming" ? addDays(today, 1) : today;

  return (
    <div className="space-y-4">
      <Composer defaultDate={composerDate} onAdded={(t) => setItems((l) => [...l, t])} />
      {error ? <p role="alert" className="rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p> : null}

      {mode.kind === "day" && total > 0 ? (
        <div>
          <p className="text-[13px]"><strong className="font-semibold">{done}</strong> of {total} done</p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((done / total) * 100)} aria-label="Completed">
            <div className="h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {overdue.length > 0 ? (
        <section aria-label="Overdue">
          <div className="mb-1 flex items-center justify-between px-3">
            <h2 className="text-xs font-medium text-danger">Overdue · {overdue.length}</h2>
            <Button size="small" color="inherit" disabled={moving} onClick={() => void moveOverdue()}>{moving ? "Moving…" : "Move all to today"}</Button>
          </div>
          <ul className="space-y-px">{overdue.map((t) => (<TodoRow key={t.id} todo={t} today={today} onChange={change} onDelete={remove} />))}</ul>
        </section>
      ) : null}

      {empty ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-medium">{emptyTitle}</p>
          <p className="mt-1 text-ink-muted">{emptyHint}</p>
        </div>
      ) : (
        groups.map((g) => g.items.length === 0 ? null : (
          <section key={g.key} aria-label={g.title || "Tasks"}>
            {g.title ? <h2 className="mb-1 px-3 text-xs font-medium text-ink-muted">{g.title} · {g.items.length}</h2> : overdue.length > 0 ? <h2 className="mb-1 px-3 text-xs font-medium text-ink-muted">Today · {g.items.length}</h2> : null}
            <ul className="space-y-px">{g.items.map((t) => (<TodoRow key={t.id} todo={t} today={today} onChange={change} onDelete={remove} />))}</ul>
          </section>
        ))
      )}
    </div>
  );
}
