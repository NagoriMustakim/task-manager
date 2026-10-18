"use client";

import Button from "@mui/material/Button";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSeconds } from "@/lib/time";
import { addDays, formatLongDate, formatMinutes, relativeDateLabel } from "@/lib/dates";
import { bucketOf, isReschedulable, isUnfinished, summariseDay, type DayBucket } from "../metrics";
import { compareItems, type Category, type TaskItem } from "../types";
import { useTaskStore } from "../use-task-store";
import { AiPanel } from "@/features/ai/components/ai-panel";
import { Composer } from "./composer";
import { MoveForm } from "./move-form";
import { Popover } from "./popover";
import { RolloverReview } from "./rollover-review";
import { TaskRow } from "./task-row";

export type WorkspaceView = { mode: "day"; date: string } | { mode: "upcoming" } | { mode: "all" };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

interface Section { key: string; title: string; tone?: "danger"; items: TaskItem[] }

const HISTORY_ORDER: { bucket: DayBucket; title: string }[] = [
  { bucket: "pending", title: "Still pending" },
  { bucket: "incomplete", title: "Marked incomplete" },
  { bucket: "done_on_time", title: "Completed on time" },
  { bucket: "done_late", title: "Completed after planned date" },
  { bucket: "moved", title: "Moved to another date" },
];

export function TaskWorkspace({
  initialItems, categories: initialCategories, today, view, composerDate, emptyTitle, emptyHint, lastReviewDate, goals = [], aiConfigured,
}: {
  aiConfigured?: boolean;
  goals?: { id: string; title: string }[];
  initialItems: TaskItem[];
  categories: Category[];
  today: string;
  view: WorkspaceView;
  composerDate: string;
  emptyTitle: string;
  emptyHint: string;
  lastReviewDate?: string | null;
}) {
  const store = useTaskStore(initialItems, today);
  const [categories, setCategories] = useState(initialCategories);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(lastReviewDate === today);
  const [busy, setBusy] = useState(false);
  const rows = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => setCategories(initialCategories), [initialCategories]);
  useEffect(() => setSelected(new Set()), [initialItems]);

  const historic = view.mode === "day" && view.date < today;
  const isToday = view.mode === "day" && view.date === today;

  const { sections, dayItems, overdue } = useMemo((): { sections: Section[]; dayItems: TaskItem[]; overdue: TaskItem[] } => {
    const sorted = [...store.items].sort(compareItems);
    if (view.mode === "day") {
      const day = sorted.filter((i) => i.scheduledDate === view.date);
      const over = isToday ? sorted.filter((i) => isUnfinished(i) && i.scheduledDate < today) : [];
      let secs: Section[];
      if (historic) {
        secs = HISTORY_ORDER.map(({ bucket, title }) => ({ key: bucket, title, items: day.filter((i) => bucketOf(i) === bucket) })).filter((s) => s.items.length);
      } else {
        const staying = day.filter((i) => !i.movedToId);
        const away = day.filter((i) => i.movedToId);
        secs = [
          ...(over.length ? [{ key: "overdue", title: "Overdue", tone: "danger" as const, items: over }] : []),
          { key: "day", title: over.length ? "Scheduled" : "", items: staying },
          ...(away.length ? [{ key: "moved", title: "Moved to another date", items: away }] : []),
        ];
      }
      return { sections: secs, dayItems: day, overdue: over };
    }
    const groupBy = (list: TaskItem[]) => {
      const m = new Map<string, TaskItem[]>();
      for (const i of list) m.set(i.scheduledDate, [...(m.get(i.scheduledDate) ?? []), i]);
      return [...m].map(([d, items]) => ({ key: d, title: `${relativeDateLabel(d, today)} · ${formatLongDate(d)}`, items }));
    };
    if (view.mode === "upcoming") return { sections: groupBy(sorted.filter((i) => i.scheduledDate > today && !i.movedToId)), dayItems: [], overdue: [] };
    return { sections: groupBy([...sorted].reverse()).map((s) => ({ ...s, items: [...s.items].reverse() })), dayItems: [], overdue: [] };
  }, [store.items, view, today, historic, isToday]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeId = focusId && flat.some((i) => i.id === focusId) ? focusId : flat[0]?.id ?? null;
  const unfinished = flat.filter(isUnfinished);
  const selectedItems = flat.filter((i) => selected.has(i.id));
  const movable = selectedItems.filter(isReschedulable).map((i) => i.id);
  const completable = selectedItems.filter((i) => !i.movedToId).map((i) => i.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void store.undoLast(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "z") { void store.undoLast(); return; }
      if (e.key === "Escape" && selected.size) { setSelected(new Set()); return; }
      if (flat.length === 0) return;
      const idx = flat.findIndex((i) => i.id === activeId);
      const go = (n: number) => {
        const next = flat[Math.max(0, Math.min(flat.length - 1, n))];
        if (next) { setFocusId(next.id); rows.current.get(next.id)?.focus(); }
      };
      const inList = (e.target as HTMLElement | null)?.closest?.("[data-task-list]");
      if (e.key === "j" || (inList && e.key === "ArrowDown")) { e.preventDefault(); go(idx + 1); }
      else if (e.key === "k" || (inList && e.key === "ArrowUp")) { e.preventDefault(); go(idx - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, activeId, store, selected.size]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const moveSelected = async (date: string, keepTime = true, reason: string | null = null) => {
    setBusy(true);
    const ok = await store.reschedule({ ids: movable, date, keepTime, reason });
    setBusy(false);
    if (ok) setSelected(new Set());
  };
  const moveAllUnfinished = async () => {
    setBusy(true);
    await store.reschedule({ ids: unfinished.map((i) => i.id), date: addDays(today, 1), keepTime: true });
    setBusy(false);
  };

  const showReviewBanner = isToday && overdue.length > 0 && !reviewed;

  return (
    <div className="space-y-4">
      {view.mode === "day" ? (
        <DaySummaryCard
          items={dayItems}
          overdueCount={overdue.length}
          historic={historic}
          unfinishedCount={unfinished.length}
          canMoveAll={view.date <= today && unfinished.length > 0}
          onMoveAll={() => void moveAllUnfinished()}
          busy={busy}
          onReview={isToday && overdue.length ? () => setReviewOpen(true) : undefined}
        />
      ) : null}

      {showReviewBanner ? (
        <div role="region" aria-label="Day rollover" className="flex flex-wrap items-center gap-3 rounded-xl border border-pri-high/40 bg-pri-high/10 px-4 py-3 text-[13px]">
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">{overdue.length} unfinished {overdue.length === 1 ? "task" : "tasks"}</strong> from earlier days.
            Choose what to carry forward, mark incomplete, or leave pending.
          </p>
          <Button size="small" variant="contained" color="inherit" onClick={() => setReviewOpen(true)} sx={{ bgcolor: "text.primary", color: "background.default" }}>Review</Button>
        </div>
      ) : null}

      {view.mode === "day" && aiConfigured !== undefined ? <AiPanel store={store} configured={aiConfigured} date={view.date} today={today} /> : null}
      <Composer store={store} defaultDate={composerDate} categories={categories} onCategoriesChange={setCategories} />

      {flat.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-medium">{emptyTitle}</p>
          <p className="mt-1 text-ink-muted">{emptyHint}</p>
        </div>
      ) : (
        <div data-task-list className="space-y-5">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title || "Tasks"}>
              {s.title ? (
                <h2 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${s.tone === "danger" ? "text-danger" : "text-ink-muted"}`}>
                  {s.title} <span className="font-normal">· {s.items.length}</span>
                </h2>
              ) : null}
              <ul className="space-y-2">
                {s.items.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    store={store}
                    categories={categories}
                    today={today}
                    focused={item.id === activeId}
                    onFocusRow={() => setFocusId(item.id)}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggle(item.id)}
                    showHistory={historic}
                    goals={goals}
                    aiConfigured={Boolean(aiConfigured)}
                    ref={(el) => { if (el) rows.current.set(item.id, el); else rows.current.delete(item.id); }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {selected.size > 0 ? (
        <div role="toolbar" aria-label="Bulk actions" className="fixed inset-x-3 bottom-[4.5rem] z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface px-3 py-2 shadow-lg md:bottom-6 md:left-[calc(50%+1.75rem)] md:right-auto md:w-[min(44rem,calc(100vw-6rem))] md:-translate-x-1/2">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <Button size="small" variant="contained" disabled={busy || movable.length === 0} onClick={() => void moveSelected(addDays(today, 1))}>Tomorrow</Button>
          <Popover
            label="Reschedule selected"
            trigger={(p) => (<Button {...p} data-popover-trigger size="small" variant="outlined" color="inherit" disabled={movable.length === 0} sx={{ borderColor: "divider" }}>Pick date…</Button>)}
          >
            {(close) => <MoveForm today={today} count={movable.length} busy={busy} onSubmit={(c) => { close(); void moveSelected(c.date, c.keepTime, c.reason); }} />}
          </Popover>
          <Button size="small" variant="outlined" color="inherit" disabled={completable.length === 0} onClick={() => void store.setStatusMany(completable, "done")} sx={{ borderColor: "divider" }}>Done</Button>
          <Button size="small" variant="outlined" color="inherit" disabled={completable.length === 0} onClick={() => void store.setStatusMany(completable, "incomplete")} sx={{ borderColor: "divider" }}>Incomplete</Button>
          <Button size="small" color="inherit" onClick={() => setSelected(new Set())} sx={{ ml: "auto" }}>Clear</Button>
        </div>
      ) : null}

      {isToday ? (
        <RolloverReview open={reviewOpen} onClose={() => setReviewOpen(false)} items={overdue} store={store} today={today} onReviewed={() => setReviewed(true)} />
      ) : null}
    </div>
  );
}

function DaySummaryCard({
  items, overdueCount, historic, unfinishedCount, canMoveAll, onMoveAll, busy, onReview,
}: {
  items: TaskItem[]; overdueCount: number; historic: boolean; unfinishedCount: number;
  canMoveAll: boolean; onMoveAll: () => void; busy: boolean; onReview?: (() => void) | undefined;
}) {
  const m = summariseDay(items);
  const done = m.doneOnTime + m.doneLate;
  const planned = items.reduce((n, i) => n + (i.estimatedMinutes ?? 0), 0);
  const tracked = items.reduce((n, i) => n + i.trackedSeconds, 0);
  const staying = m.occurrences - m.moved;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
        <span><strong className="font-semibold">{done}</strong>/{staying} done</span>
        {!historic && overdueCount > 0 ? <span className="text-danger">{overdueCount} overdue</span> : null}
        {planned > 0 ? <span className="text-ink-muted">{formatMinutes(planned)} planned</span> : null}
        {tracked > 0 ? <span className="text-ink-muted">{formatSeconds(tracked)} recorded</span> : null}
        <span className="ml-auto text-ink-muted" title="Scheduled entries on this day vs. distinct underlying tasks">
          {m.occurrences} {m.occurrences === 1 ? "entry" : "entries"} · {m.uniqueTasks} unique {m.uniqueTasks === 1 ? "task" : "tasks"}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.completionRate} aria-label="Completion">
        <div className="h-full rounded-full bg-success transition-[width] duration-200" style={{ width: `${m.completionRate}%` }} />
      </div>
      {historic && m.occurrences > 0 ? (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <Stat label="on time" value={m.doneOnTime} />
          <Stat label="late" value={m.doneLate} />
          <Stat label="pending" value={m.pending} />
          <Stat label="incomplete" value={m.incomplete} />
          <Stat label="moved" value={m.moved} />
          <Stat label="planned earlier" value={m.plannedEarlier} />
        </dl>
      ) : null}
      {canMoveAll || onReview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canMoveAll ? (
            <Button size="small" variant="outlined" color="inherit" disabled={busy} onClick={onMoveAll} sx={{ borderColor: "divider" }}>
              Move {unfinishedCount} unfinished to tomorrow
            </Button>
          ) : null}
          {onReview ? <Button size="small" variant="outlined" color="inherit" onClick={onReview} sx={{ borderColor: "divider" }}>Review unfinished…</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (<div className="flex gap-1"><dd className="font-medium text-ink">{value}</dd><dt>{label}</dt></div>);
}
