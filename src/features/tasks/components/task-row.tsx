"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { addDays, formatMinutes, formatShortDate, relativeDateLabel } from "@/lib/dates";
import { describeRule } from "@/lib/recurrence";
import { stopRecurrenceAction } from "../actions";
import { useToast } from "./toast";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, isOpen, type Category, type TaskItem } from "../types";
import { BreakdownSuggest } from "@/features/ai/components/breakdown";
import { TimeChip, TimerButton } from "./timer-control";
import { IconArchive, IconCalendar, IconClock, StatusGlyph } from "./icons";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { DateField, SelectField, TimeField } from "@/components/ui/fields";
import { PRIORITY_BAR, PRIORITY_CHIP, STATUS_COLOR } from "./priority-style";
import { ChoiceList, Popover } from "./popover";
import type { useTaskStore } from "../use-task-store";

type Store = ReturnType<typeof useTaskStore>;

const chip =
  "inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-xs text-ink-muted hover:border-line-strong hover:bg-canvas aria-expanded:border-line-strong aria-expanded:bg-canvas";
const INTERACTIVE = "button,a,input,textarea,select,label,summary,[role=dialog],[role=menu],[role=menuitem],[role=radio],.MuiPopover-root,.MuiModal-root";

export const TaskRow = forwardRef<
  HTMLLIElement,
  {
    item: TaskItem;
    store: Store;
    categories: Category[];
    today: string;
    focused: boolean;
    onFocusRow: () => void;
    selected: boolean;
    onToggleSelect: () => void;
    showHistory?: boolean;
    goals?: { id: string; title: string }[];
    aiConfigured?: boolean;
  }
>(function TaskRow({ item, store, categories, today, focused, onFocusRow, selected, onToggleSelect, showHistory, goals = [], aiConfigured = false }, ref) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const moved = Boolean(item.movedToId);
  const overdue = isOpen(item.status) && !moved && item.scheduledDate < today;
  const lateDone = item.status === "done" && item.completedOn !== null && item.completedOn > item.scheduledDate;
  const plannedEarlier = showHistory && item.createdDate < item.scheduledDate && item.originalDate === item.scheduledDate;
  const category = categories.find((c) => c.id === item.categoryId);

  // Row-level keyboard shortcuts (active only when the row itself has focus).
  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "s") { e.preventDefault(); onToggleSelect(); return; }
    if (k === "o") { setOpen((o) => !o); return; }
    if (moved) return;
    if (k === "t" && item.status !== "done") { void store.reschedule({ ids: [item.id], date: addDays(today, 1), keepTime: true }); return; }
    if (k === " " || k === "x") { e.preventDefault(); void store.setStatus(item.id, item.status === "done" ? "new" : "done"); }
    else if (k === "p") void store.setStatus(item.id, "pending");
    else if (k === "i") void store.setStatus(item.id, "incomplete");
    else if (k === "e" || k === "Enter") { e.preventDefault(); setEditing(true); }
    else if (k === "#" || k === "Delete") void store.archive(item.id);
    else if (["1", "2", "3", "4"].includes(k)) void store.setTask(item.taskId, { priority: PRIORITIES[Number(k) - 1]! }, `Priority ${PRIORITIES[Number(k) - 1]}`);
  };

  return (
    <li
      ref={ref}
      tabIndex={focused ? 0 : -1}
      data-row-id={item.id}
      onFocus={(e) => { if (e.target === e.currentTarget) onFocusRow(); }}
      onKeyDown={onKeyDown}
      aria-label={`${item.title}, ${STATUS_LABEL[item.status]}, ${PRIORITY_LABEL[item.priority]} priority`}
      onClick={(e) => {
        // Anywhere on the row opens the details, except on its own controls and text being selected.
        if ((e.target as HTMLElement).closest(INTERACTIVE) || window.getSelection()?.toString()) return;
        setOpen((o) => !o);
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-surface transition-colors hover:border-line-strong hover:shadow-sm focus-visible:border-accent ${open ? "border-line-strong shadow-sm" : "border-line"} ${selected ? "ring-1 ring-accent" : ""}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_BAR[item.priority]}`} />
      <div className="flex items-start gap-2 py-2.5 pl-4 pr-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.title}`}
          className="mt-2.5 size-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        {moved ? (
          <span className="mt-0.5 flex size-8 items-center justify-center text-ink-muted" role="img" aria-label={`Status when moved: ${STATUS_LABEL[item.status]}`}>
            <StatusGlyph status={item.status} />
          </span>
        ) : (
        <Popover
          label="Change status"
          trigger={(p) => (
            <button
              {...p}
              data-popover-trigger
              aria-label={`Status: ${STATUS_LABEL[item.status]}. Change status`}
              className={`mt-0.5 flex size-8 items-center justify-center rounded-full hover:bg-canvas ${STATUS_COLOR[item.status]}`}
              onClick={(e) => { e.stopPropagation(); p.onClick(); }}
              onDoubleClick={() => void store.setStatus(item.id, item.status === "done" ? "new" : "done")}
            >
              <StatusGlyph status={item.status} />
            </button>
          )}
        >
          {(close) => (
            <ChoiceList
              value={item.status}
              onPick={(s) => { close(); void store.setStatus(item.id, s); }}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: <StatusGlyph status={s} className={STATUS_COLOR[s]} /> }))}
            />
          )}
        </Popover>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {editing ? (
              <TitleEditor
                initial={item.title}
                onCancel={() => setEditing(false)}
                onSave={(t) => { setEditing(false); if (t !== item.title) void store.setTask(item.taskId, { title: t }, "Title updated"); }}
              />
            ) : (
              <span
                onDoubleClick={() => setEditing(true)}
                className={`min-w-0 flex-1 text-sm font-medium leading-6 ${open ? "whitespace-normal break-words" : "truncate"} ${item.status === "done" ? "text-ink-muted line-through" : ""}`}
                title="Click for details · double-click to rename"
              >
                {item.title}
              </span>
            )}
            {overdue ? (
              <span className="mt-0.5 shrink-0 rounded-full border border-danger/40 bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Overdue</span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {moved ? (
              <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${PRIORITY_CHIP[item.priority]}`}>{PRIORITY_LABEL[item.priority]}</span>
            ) : (
              <>
                <PriorityChip item={item} store={store} />
                <ScheduleChip item={item} store={store} today={today} overdue={overdue} />
                <DurationChip item={item} store={store} />
                <TimeChip item={item} />
              </>
            )}
            {moved ? (
              <span className="px-1.5 text-xs text-ink-muted">
                Moved to {item.movedToDate ? formatShortDate(item.movedToDate) : "another date"}
                {item.movedReason ? ` · “${item.movedReason}”` : ""}
              </span>
            ) : null}
            {item.originalDate !== item.scheduledDate ? <span className="px-1.5 text-xs text-ink-muted">Originally {formatShortDate(item.originalDate)}</span> : null}
            {lateDone && item.completedOn ? <span className="px-1.5 text-xs text-pri-high">Done {formatShortDate(item.completedOn)} (after planned date)</span> : null}
            {plannedEarlier ? <span className="px-1.5 text-xs text-ink-muted">Created {formatShortDate(item.createdDate)}</span> : null}
            {item.recurrenceRule ? <span className="px-1.5 text-xs text-ink-muted" title="Repeating task">↻ {describeRule(item.recurrenceRule)}</span> : null}
            {category ? <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-xs text-ink-muted">{category.name}</span> : null}
            {item.deadlineDate ? (
              <span className={`px-1.5 text-xs ${isOpen(item.status) && item.deadlineDate < today ? "text-danger" : "text-ink-muted"}`}>
                Due {formatShortDate(item.deadlineDate)}
              </span>
            ) : null}
          </div>

        </div>

        <div className="flex shrink-0 items-center">
          <TimerButton item={item} />
          <button
            type="button"
            aria-label={open ? "Hide details" : "Show details"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas"
          >
            <ExpandMoreRounded fontSize="small" className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {!moved && item.status !== "done" ? (
            <button
              type="button"
              aria-label="Move to tomorrow"
              title="Move to tomorrow (T)"
              onClick={() => void store.reschedule({ ids: [item.id], date: addDays(today, 1), keepTime: true })}
              className="flex h-8 items-center rounded-full px-2 text-xs text-ink-muted hover:bg-canvas hover:text-ink md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
            >
              Tomorrow
            </button>
          ) : null}
          {!moved ? (
          <button
            type="button"
            aria-label="Archive task"
            onClick={() => void store.archive(item.id)}
            className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-danger md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          >
            <IconArchive />
          </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="px-4 pb-4 pl-4 md:pl-[3.75rem]">
          <Details item={item} store={store} categories={categories} today={today} goals={goals} aiConfigured={aiConfigured} />
        </div>
      ) : null}
    </li>
  );
});

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
      maxLength={500}
      aria-label="Task title"
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1 text-sm"
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.stopPropagation(); done.current = true; onCancel(); }
      }}
    />
  );
}

function PriorityChip({ item, store }: { item: TaskItem; store: Store }) {
  return (
    <Popover
      label="Change priority"
      trigger={(p) => (
        <button {...p} data-popover-trigger className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold hover:brightness-110 ${PRIORITY_CHIP[item.priority]}`} aria-label={`Priority: ${PRIORITY_LABEL[item.priority]}. Change priority`}>
          <span aria-hidden className={`size-2 rounded-full ${PRIORITY_BAR[item.priority]}`} />
          {PRIORITY_LABEL[item.priority]}
        </button>
      )}
    >
      {(close) => (
        <ChoiceList
          value={item.priority}
          onPick={(v) => { close(); void store.setTask(item.taskId, { priority: v }, `Priority ${PRIORITY_LABEL[v].toLowerCase()}`); }}
          options={PRIORITIES.map((v, i) => ({ value: v, label: PRIORITY_LABEL[v], hint: String(i + 1), icon: <span aria-hidden className={`size-2.5 rounded-full ${PRIORITY_BAR[v]}`} /> }))}
        />
      )}
    </Popover>
  );
}

function ScheduleChip({ item, store, today, overdue }: { item: TaskItem; store: Store; today: string; overdue: boolean }) {
  const time = item.startTime ? (item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime) : null;
  return (
    <Popover
      label="Change schedule"
      trigger={(p) => (
        <button {...p} data-popover-trigger className={`${chip} ${overdue ? "border-danger/40 text-danger" : ""}`} aria-label={`Scheduled ${item.scheduledDate}${time ? ` ${time}` : ""}. Change schedule`}>
          <IconCalendar width={12} height={12} />
          {relativeDateLabel(item.scheduledDate, today)}
          {time ? <span className="text-ink">· {time}</span> : null}
        </button>
      )}
    >
      {(close) => <ScheduleEditor item={item} store={store} today={today} close={close} />}
    </Popover>
  );
}

function ScheduleEditor({ item, store, today, close }: { item: TaskItem; store: Store; today: string; close: () => void }) {
  const [date, setDate] = useState(item.scheduledDate);
  const [start, setStart] = useState(item.startTime ?? "");
  const [end, setEnd] = useState(item.endTime ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const dateChanged = date !== item.scheduledDate;
  const canMove = item.status !== "done";
  const error = end && (!start || end <= start) ? "End must be after start." : null;

  const apply = async () => {
    if (error || !date || busy) return;
    if (dateChanged) {
      setBusy(true);
      const ok = await store.reschedule({
        ids: [item.id],
        date,
        keepTime: false,
        startTime: start || null,
        endTime: end || null,
        reason: reason.trim() || null,
      });
      setBusy(false);
      if (ok) close();
      return;
    }
    const patch: { startTime?: string | null; endTime?: string | null } = {};
    if ((start || null) !== item.startTime) patch.startTime = start || null;
    if ((end || null) !== item.endTime) patch.endTime = end || null;
    if (!start && item.endTime) patch.endTime = null;
    if (Object.keys(patch).length) void store.setTimes(item.id, patch);
    close();
  };

  return (
    <form className="w-64 space-y-3 p-1.5" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
      {canMove ? (
        <div className="flex gap-1.5">
          {[["Today", today], ["Tomorrow", addDays(today, 1)]].map(([l, d]) => (
            <Button key={l} type="button" size="small" variant={date === d ? "contained" : "outlined"} onClick={() => setDate(d!)} aria-pressed={date === d} sx={{ flex: 1 }}>{l}</Button>
          ))}
        </div>
      ) : null}
      <DateField label="Date" required min={canMove ? today : undefined} disabled={!canMove} value={date} onChange={setDate} autoFocus fullWidth />
      <div className="flex gap-2">
        <TimeField label="Start" value={start} onChange={setStart} fullWidth />
        <TimeField label="End" value={end} onChange={setEnd} fullWidth />
      </div>
      {dateChanged ? (
        <>
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. waiting on client" slotProps={{ htmlInput: { maxLength: 280 } }} fullWidth />
          <p className="text-[11px] text-ink-muted">Creates a new entry on that date. This day keeps its record.</p>
        </>
      ) : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="small" color="inherit" onClick={() => { setStart(""); setEnd(""); }}>Clear time</Button>
        <Button type="submit" size="small" variant="contained" disabled={Boolean(error) || busy}>
          {busy ? "Moving…" : dateChanged ? "Move" : "Save"}
        </Button>
      </div>
    </form>
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120];

function DurationChip({ item, store }: { item: TaskItem; store: Store }) {
  return (
    <Popover
      label="Estimated duration"
      trigger={(p) => (
        <button {...p} data-popover-trigger className={chip} aria-label={`Estimate: ${item.estimatedMinutes ? formatMinutes(item.estimatedMinutes) : "none"}. Change estimate`}>
          <IconClock width={12} height={12} />
          {item.estimatedMinutes ? `Est. ${formatMinutes(item.estimatedMinutes)}` : "Estimate"}
        </button>
      )}
    >
      {(close) => <DurationEditor item={item} store={store} close={close} />}
    </Popover>
  );
}

function DurationEditor({ item, store, close }: { item: TaskItem; store: Store; close: () => void }) {
  const [custom, setCustom] = useState(item.estimatedMinutes ? String(item.estimatedMinutes) : "");
  const set = (m: number | null) => { close(); if (m !== item.estimatedMinutes) void store.setTask(item.taskId, { estimatedMinutes: m }, m ? `Estimate ${formatMinutes(m)}` : "Estimate cleared"); };
  const n = Number(custom);
  const valid = Number.isInteger(n) && n >= 1 && n <= 1440;
  return (
    <form className="w-56 space-y-3 p-1.5" onSubmit={(e) => { e.preventDefault(); if (valid) set(n); }}>
      <div className="grid grid-cols-3 gap-1.5">
        {DURATIONS.map((m) => (
          <Button key={m} type="button" size="small" variant={item.estimatedMinutes === m ? "contained" : "outlined"} onClick={() => set(m)} aria-pressed={item.estimatedMinutes === m} sx={{ minWidth: 0 }}>{formatMinutes(m)}</Button>
        ))}
      </div>
      <TextField label="Custom (minutes)" type="number" value={custom} onChange={(e) => setCustom(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 1440, inputMode: "numeric" } }} autoFocus fullWidth />
      <div className="flex items-center justify-between">
        <Button type="button" size="small" color="inherit" onClick={() => set(null)}>Clear</Button>
        <Button type="submit" size="small" variant="contained" disabled={!valid}>Save</Button>
      </div>
    </form>
  );
}

function Details({ item, store, categories, today, goals, aiConfigured }: { item: TaskItem; store: Store; categories: Category[]; today: string; goals: { id: string; title: string }[]; aiConfigured: boolean }) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [title, setTitle] = useState(item.title);
  const saveTitle = () => { const t = title.trim(); if (!t) { setTitle(item.title); return; } if (t !== item.title) void store.setTask(item.taskId, { title: t }, "Title updated"); };
  return (
    <div className="mt-1 flex cursor-default flex-col gap-4 border-t border-line pt-4" onClick={(e) => e.stopPropagation()}>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} slotProps={{ htmlInput: { maxLength: 500 } }} fullWidth />
      <TextField
        label="Description"
        value={notes}
        multiline
        minRows={3}
        maxRows={12}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { const v = notes.trim() || null; if (v !== item.notes) void store.setTask(item.taskId, { notes: v }, "Description updated"); }}
        slotProps={{ htmlInput: { maxLength: 10000 } }}
        placeholder="Add details…"
        fullWidth
      />
      <div className="flex flex-wrap gap-3">
        <SelectField
          label="Category"
          value={item.categoryId ?? ""}
          onChange={(v) => void store.setTask(item.taskId, { categoryId: v || null }, "Category updated")}
          options={[{ value: "", label: "None" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          sx={{ minWidth: 170 }}
        />
        {goals.length || item.goalId ? (
          <SelectField
            label="Goal"
            value={item.goalId ?? ""}
            onChange={(v) => void store.setTask(item.taskId, { goalId: v || null }, "Goal updated")}
            options={[{ value: "", label: "None" }, ...goals.map((g) => ({ value: g.id, label: g.title }))]}
            sx={{ minWidth: 170 }}
          />
        ) : null}
        <DateField label="Deadline" value={item.deadlineDate ?? ""} onChange={(v) => void store.setTask(item.taskId, { deadline: v || null }, "Deadline updated")} sx={{ width: 170 }} />
      </div>
      {item.recurrenceRule ? <StopRepeating item={item} today={today} /> : null}
      {!item.movedToId ? <BreakdownSuggest item={item} store={store} configured={aiConfigured} /> : null}
      <p className="text-[11px] text-ink-muted">
        Created {new Date(item.createdAt).toLocaleString()} · Updated {new Date(item.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function StopRepeating({ item, today }: { item: TaskItem; today: string }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <span>↻ {describeRule(item.recurrenceRule ?? "")}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await stopRecurrenceAction(item.taskId);
          setBusy(false);
          notify(r.ok ? `Stopped repeating from ${relativeDateLabel(today, today).toLowerCase()}. ${r.data.removed} untouched future ${r.data.removed === 1 ? "entry" : "entries"} removed. Reload to refresh.` : r.error, r.ok ? undefined : { tone: "error" });
        }}
        className="rounded-full border border-line-strong px-3 py-1 hover:bg-canvas disabled:opacity-50"
      >
        Stop repeating
      </button>
    </div>
  );
}
