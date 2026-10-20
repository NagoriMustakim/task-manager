"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import { DateField, TimeField } from "@/components/ui/fields";
import { addDays, formatShortDate, relativeDateLabel } from "@/lib/dates";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, isOpen, type Priority, type Status, type Todo } from "../types";
import { IconCalendar, IconClock, IconTrash, StatusGlyph } from "./icons";
import { ChoiceList, Popover } from "./popover";

export type Change = Partial<Pick<Todo, "title" | "status" | "date" | "start" | "end">> & { priority?: Exclude<Priority, "none"> };

const STATUS_COLOR: Record<Status, string> = { new: "text-ink-muted", pending: "text-pri-high", done: "text-success", incomplete: "text-danger" };
const PRIORITY_TEXT: Record<Priority, string> = { none: "text-pri-medium", low: "text-pri-low", medium: "text-pri-medium", high: "text-pri-high", urgent: "text-pri-urgent" };
const PRIORITY_BAR: Record<Priority, string> = { none: "bg-pri-medium", low: "bg-pri-low", medium: "bg-pri-medium", high: "bg-pri-high", urgent: "bg-pri-urgent" };
const chip = "inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-xs text-ink-muted hover:bg-line/60 aria-expanded:bg-line/60";

export function TodoRow({ todo, today, onChange, onDelete }: { todo: Todo; today: string; onChange: (id: string, c: Change) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const overdue = isOpen(todo.status) && todo.date < today;
  const tomorrow = addDays(today, 1);

  return (
    <li className="group relative rounded-lg hover:bg-surface">
      <span aria-hidden className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${PRIORITY_BAR[todo.priority]}`} />
      <div className="flex items-start gap-2 py-2 pl-3 pr-2">
        <Popover
          label="Change status"
          trigger={(p) => (
            <button {...p} aria-label={`Status: ${STATUS_LABEL[todo.status]}. Change status`} className={`mt-0.5 flex size-8 items-center justify-center rounded-full hover:bg-line/60 md:size-6 ${STATUS_COLOR[todo.status]}`}>
              <StatusGlyph status={todo.status} />
            </button>
          )}
        >
          {(close) => (
            <ChoiceList
              value={todo.status}
              onPick={(s) => { close(); onChange(todo.id, { status: s }); }}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: <StatusGlyph status={s} className={STATUS_COLOR[s]} /> }))}
            />
          )}
        </Popover>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {editing ? (
              <TitleEditor initial={todo.title} onCancel={() => setEditing(false)} onSave={(t) => { setEditing(false); if (t !== todo.title) onChange(todo.id, { title: t }); }} />
            ) : (
              <button type="button" onClick={() => setEditing(true)} title="Click to edit" className={`min-w-0 flex-1 text-left text-sm leading-6 hover:text-accent ${todo.status === "done" ? "text-ink-muted line-through" : ""}`}>
                <span className="block break-words">{todo.title}</span>
              </button>
            )}
            {overdue ? <span className="mt-0.5 shrink-0 rounded bg-danger-bg px-1.5 py-0.5 text-[11px] font-medium text-danger">Overdue</span> : null}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-0.5 gap-y-1">
            <Popover
              label="Change priority"
              trigger={(p) => (<button {...p} className={`${chip} ${PRIORITY_TEXT[todo.priority]}`} aria-label={`Priority ${PRIORITY_LABEL[todo.priority]}. Change`}>{PRIORITY_LABEL[todo.priority]}</button>)}
            >
              {(close) => (
                <ChoiceList value={todo.priority === "none" ? "medium" : todo.priority} onPick={(v) => { close(); onChange(todo.id, { priority: v }); }} options={PRIORITIES.map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))} />
              )}
            </Popover>

            <Popover
              label="Start and end time"
              trigger={(p) => (
                <button {...p} className={chip} aria-label={`Time ${todo.start ? `${todo.start}${todo.end ? ` to ${todo.end}` : ""}` : "not set"}. Change`}>
                  <IconClock width={12} height={12} />
                  {todo.start ? (todo.end ? `${todo.start}–${todo.end}` : todo.start) : "Add time"}
                </button>
              )}
            >
              {(close) => <TimeEditor start={todo.start} end={todo.end} onSave={(start, end) => { close(); onChange(todo.id, { start, end }); }} />}
            </Popover>

            <Popover
              label="Move to another day"
              trigger={(p) => (
                <button {...p} className={`${chip} ${overdue ? "text-danger" : ""}`} aria-label={`Day ${todo.date}. Move to another day`}>
                  <IconCalendar width={12} height={12} />
                  {relativeDateLabel(todo.date, today)}
                </button>
              )}
            >
              {(close) => <DayPicker current={todo.date} today={today} onPick={(d) => { close(); if (d !== todo.date) onChange(todo.id, { date: d }); }} />}
            </Popover>

            {todo.date !== tomorrow ? (
              <button type="button" onClick={() => onChange(todo.id, { date: tomorrow })} className={`${chip} hover:text-ink`} title={`Move to ${formatShortDate(tomorrow)}`}>
                → Tomorrow
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {confirm ? (
            <span className="flex items-center gap-1 text-xs">
              <button type="button" onClick={() => onDelete(todo.id)} className="rounded px-1.5 py-1 font-medium text-danger hover:bg-danger-bg">Delete</button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded px-1.5 py-1 text-ink-muted hover:bg-line/60">Keep</button>
            </span>
          ) : (
            <button type="button" aria-label={`Delete ${todo.title}`} onClick={() => setConfirm(true)} className="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-line/60 hover:text-danger md:size-6 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100">
              <IconTrash />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function TitleEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = ref.current?.value.trim() ?? "";
    if (v) onSave(v); else onCancel();
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      maxLength={300}
      aria-label="Task title"
      className="h-7 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-sm text-ink"
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { done.current = true; onCancel(); }
      }}
    />
  );
}

function TimeEditor({ start, end, onSave }: { start: string | null; end: string | null; onSave: (s: string | null, e: string | null) => void }) {
  const [s, setS] = useState(start ?? "");
  const [e, setE] = useState(end ?? "");
  const bad = Boolean(e && (!s || e <= s));
  return (
    <form className="w-60 space-y-2 p-1.5" onSubmit={(ev) => { ev.preventDefault(); if (!bad) onSave(s || null, e || null); }}>
      <div className="flex gap-2">
        <TimeField label="Start" value={s} onChange={setS} autoFocus />
        <TimeField label="End" value={e} onChange={setE} />
      </div>
      {bad ? <p role="alert" className="text-xs text-danger">End must be after start.</p> : null}
      <div className="flex justify-between">
        <Button type="button" size="small" color="inherit" onClick={() => onSave(null, null)}>Clear</Button>
        <Button type="submit" size="small" variant="contained" disabled={bad}>Save</Button>
      </div>
    </form>
  );
}

/** Move to yesterday / today / tomorrow with one click, or pick any day. */
export function DayPicker({ current, today, onPick }: { current: string; today: string; onPick: (date: string) => void }) {
  const quick: [string, string][] = [["Yesterday", addDays(today, -1)], ["Today", today], ["Tomorrow", addDays(today, 1)]];
  return (
    <div className="w-64 space-y-2 p-1.5">
      <div className="flex gap-1">
        {quick.map(([label, d]) => (
          <Button key={label} size="small" variant={current === d ? "contained" : "outlined"} color={current === d ? "primary" : "inherit"} onClick={() => onPick(d)} sx={{ flex: 1, minWidth: 0, px: 0.5 }}>{label}</Button>
        ))}
      </div>
      <DateField label="Pick any day" value={current} onChange={(d) => { if (d) onPick(d); }} fullWidth />
    </div>
  );
}
