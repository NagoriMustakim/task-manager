"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./components/toast";
import { useTimer } from "@/features/time/timer-context";
import {
  archiveTaskAction,
  bulkStatusAction,
  createTaskAction,
  rescheduleAction,
  undoRescheduleAction,
  updateOccurrenceAction,
  updateTaskAction,
} from "./actions";
import type { CreateTaskInput, OccurrencePatch, RescheduleInput, TaskPatch } from "./schemas";
import { STATUS_LABEL, type TaskItem } from "./types";
import { relativeDateLabel } from "@/lib/dates";

type UndoEntry = () => Promise<void>;

/**
 * Client-side task list with optimistic updates. Every mutation snapshots the fields it
 * changes, applies them immediately, calls the server action, and restores the snapshot
 * (with an error toast) if the server rejects. Successful reversible changes register an
 * undo that is exposed through the toast and the Z shortcut.
 */
export function useTaskStore(initial: TaskItem[], today: string) {
  const [items, setItemsState] = useState<TaskItem[]>(initial);
  const ref = useRef(items);
  const undoStack = useRef<UndoEntry[]>([]);
  const { notify } = useToast();
  const timer = useTimer();

  const setItems = useCallback((fn: (l: TaskItem[]) => TaskItem[]) => {
    ref.current = fn(ref.current);
    setItemsState(ref.current);
  }, []);

  // Re-sync when the server sends fresh data (navigation / date change).
  useEffect(() => {
    ref.current = initial;
    setItemsState(initial);
    undoStack.current = [];
  }, [initial]);

  // Keep recorded-time totals in sync when timers stop or entries change anywhere in the app.
  useEffect(
    () =>
      timer.subscribe((d) =>
        setItems((l) =>
          l.map((i) => ({
            ...i,
            taskTrackedSeconds: i.taskId === d.taskId ? Math.max(0, i.taskTrackedSeconds + d.seconds) : i.taskTrackedSeconds,
            trackedSeconds: d.occurrenceId && i.id === d.occurrenceId ? Math.max(0, i.trackedSeconds + d.seconds) : i.trackedSeconds,
          })),
        ),
      ),
    [timer, setItems],
  );

  const patchWhere = useCallback(
    (match: (i: TaskItem) => boolean, p: Partial<TaskItem>) =>
      setItems((l) => l.map((i) => (match(i) ? { ...i, ...p } : i))),
    [setItems],
  );

  const pushUndo = useCallback((message: string, undo: UndoEntry) => {
    undoStack.current.push(undo);
    notify(message, {
      undo: () => {
        const idx = undoStack.current.lastIndexOf(undo);
        if (idx >= 0) undoStack.current.splice(idx, 1);
        void undo();
      },
    });
  }, [notify]);

  const undoLast = useCallback(async () => {
    const fn = undoStack.current.pop();
    if (!fn) { notify("Nothing to undo."); return; }
    await fn();
  }, [notify]);

  // --- occurrence-level changes (status, date, times) ---------------------------------
  const changeOccurrence = useCallback(
    async (id: string, patch: OccurrencePatch, message: string, record = true) => {
      const cur = ref.current.find((i) => i.id === id);
      if (!cur) return;
      const prev: Partial<TaskItem> = {};
      for (const k of Object.keys(patch) as (keyof OccurrencePatch)[]) (prev as Record<string, unknown>)[k] = cur[k];
      prev.completedAt = cur.completedAt;
      prev.completedOn = cur.completedOn;

      const optimistic: Partial<TaskItem> = { ...patch };
      if (patch.status !== undefined) {
        optimistic.completedAt = patch.status === "done" ? new Date().toISOString() : null;
        optimistic.completedOn = patch.status === "done" ? today : null;
      }
      patchWhere((i) => i.id === id, optimistic);

      const res = await updateOccurrenceAction(id, patch);
      if (!res.ok) {
        patchWhere((i) => i.id === id, prev);
        notify(res.error, { tone: "error" });
        return;
      }
      patchWhere((i) => i.id === id, { completedAt: res.data.completedAt, completedOn: res.data.completedOn, updatedAt: res.data.updatedAt });
      if (record) {
        const back: OccurrencePatch = {};
        for (const k of Object.keys(patch) as (keyof OccurrencePatch)[]) (back as Record<string, unknown>)[k] = prev[k];
        pushUndo(message, () => changeOccurrence(id, back, "", false));
      } else {
        notify("Undone.");
      }
    },
    [notify, patchWhere, pushUndo],
  );

  const setStatus = useCallback(
    (id: string, status: TaskItem["status"]) => {
      const cur = ref.current.find((i) => i.id === id);
      if (!cur || cur.status === status) return Promise.resolve();
      return changeOccurrence(id, { status }, `Marked ${STATUS_LABEL[status].toLowerCase()}`);
    },
    [changeOccurrence],
  );

  /** Time-of-day edits are in place; dates go through reschedule() so history is kept. */
  const setTimes = useCallback(
    (id: string, patch: Pick<OccurrencePatch, "startTime" | "endTime">) =>
      changeOccurrence(id, patch, "Time updated"),
    [changeOccurrence],
  );

  // --- task-level changes (title, priority, duration, ...) ----------------------------
  const changeTask = useCallback(
    async (taskId: string, patch: TaskPatch, message: string, record = true) => {
      const cur = ref.current.find((i) => i.taskId === taskId);
      if (!cur) return;
      const toItem = (p: TaskPatch): Partial<TaskItem> => {
        const o: Partial<TaskItem> = {};
        if (p.title !== undefined) o.title = p.title;
        if (p.notes !== undefined) o.notes = p.notes;
        if (p.priority !== undefined) o.priority = p.priority;
        if (p.estimatedMinutes !== undefined) o.estimatedMinutes = p.estimatedMinutes;
        if (p.categoryId !== undefined) o.categoryId = p.categoryId;
        if (p.goalId !== undefined) o.goalId = p.goalId;
        if (p.deadline !== undefined) o.deadlineDate = p.deadline;
        return o;
      };
      const back: TaskPatch = {};
      if (patch.title !== undefined) back.title = cur.title;
      if (patch.notes !== undefined) back.notes = cur.notes;
      if (patch.priority !== undefined) back.priority = cur.priority;
      if (patch.estimatedMinutes !== undefined) back.estimatedMinutes = cur.estimatedMinutes;
      if (patch.categoryId !== undefined) back.categoryId = cur.categoryId;
      if (patch.goalId !== undefined) back.goalId = cur.goalId;
      if (patch.deadline !== undefined) back.deadline = cur.deadlineDate;

      patchWhere((i) => i.taskId === taskId, toItem(patch));
      const res = await updateTaskAction(taskId, patch);
      if (!res.ok) {
        patchWhere((i) => i.taskId === taskId, toItem(back));
        notify(res.error, { tone: "error" });
        return;
      }
      if (record) pushUndo(message, () => changeTask(taskId, back, "", false));
      else notify("Undone.");
    },
    [notify, patchWhere, pushUndo],
  );

  const setTask = useCallback(
    (taskId: string, patch: TaskPatch, message: string) => changeTask(taskId, patch, message),
    [changeTask],
  );

  // --- reschedule (carry forward) -------------------------------------------------------
  const reschedule = useCallback(
    async (input: RescheduleInput): Promise<boolean> => {
      const res = await rescheduleAction(input);
      if (!res.ok) { notify(res.error, { tone: "error" }); return false; }
      const { moves, newItems, movedOld } = res.data;
      if (moves.length === 0) { notify("Nothing to move: those tasks are done, already moved, or already on that date."); return false; }

      const oldById = new Map(movedOld.map((o) => [o.id, o]));
      setItems((l) => [
        ...l.map((i) => {
          const o = oldById.get(i.id);
          return o ? { ...i, movedToId: o.movedToId, movedToDate: o.movedToDate, movedAt: o.movedAt, movedReason: o.movedReason } : i;
        }),
        ...newItems,
      ]);

      const oldIds = moves.map((m) => m.oldId);
      const newIds = new Set(moves.map((m) => m.newId));
      const label = moves.length === 1 ? `Moved to ${relativeDateLabel(input.date, today)}` : `Moved ${moves.length} tasks to ${relativeDateLabel(input.date, today)}`;
      pushUndo(label, async () => {
        const r = await undoRescheduleAction(oldIds);
        if (!r.ok) { notify(r.error, { tone: "error" }); return; }
        const okIds = new Set(r.data.results.filter((x) => x.ok).map((x) => x.id));
        const restoredNew = new Set(moves.filter((m) => okIds.has(m.oldId)).map((m) => m.newId));
        setItems((l) =>
          l
            .filter((i) => !(newIds.has(i.id) && restoredNew.has(i.id)))
            .map((i) => (okIds.has(i.id) ? { ...i, movedToId: null, movedToDate: null, movedAt: null, movedReason: null } : i)),
        );
        const failed = oldIds.length - okIds.size;
        notify(failed ? `Undid ${okIds.size}. ${failed} can't be undone because they changed.` : "Move undone.", failed ? { tone: "error" } : undefined);
      });
      return true;
    },
    [notify, pushUndo, setItems, today],
  );

  /** One status for many tasks, with rollback on failure and a single undo. */
  const setStatusMany = useCallback(
    async (ids: string[], status: TaskItem["status"]) => {
      const targets = ref.current.filter((i) => ids.includes(i.id) && !i.movedToId && i.status !== status);
      if (targets.length === 0) return;
      const snapshot = targets.map((t) => ({ id: t.id, status: t.status, completedAt: t.completedAt, completedOn: t.completedOn }));
      const idSet = new Set(targets.map((t) => t.id));
      setItems((l) => l.map((i) => (idSet.has(i.id) ? { ...i, status, completedAt: status === "done" ? new Date().toISOString() : null, completedOn: status === "done" ? today : null } : i)));
      const res = await bulkStatusAction([...idSet], status);
      if (!res.ok) {
        setItems((l) => l.map((i) => { const s = snapshot.find((x) => x.id === i.id); return s ? { ...i, ...s } : i; }));
        notify(res.error, { tone: "error" });
        return;
      }
      const restore = async () => {
        for (const group of new Set(snapshot.map((s) => s.status))) {
          const back = snapshot.filter((s) => s.status === group).map((s) => s.id);
          const r = await bulkStatusAction(back, group);
          if (!r.ok) { notify(r.error, { tone: "error" }); return; }
          setItems((l) => l.map((i) => (back.includes(i.id) ? { ...i, status: group, completedAt: null, completedOn: null } : i)));
        }
        notify("Undone.");
      };
      pushUndo(`Marked ${targets.length} ${targets.length === 1 ? "task" : "tasks"} ${STATUS_LABEL[status].toLowerCase()}`, restore);
    },
    [notify, pushUndo, setItems, today],
  );

  // --- archive / create ---------------------------------------------------------------
  const archive = useCallback(
    async (id: string) => {
      const cur = ref.current.find((i) => i.id === id);
      if (!cur) return;
      const removed = ref.current.filter((i) => i.taskId === cur.taskId);
      setItems((l) => l.filter((i) => i.taskId !== cur.taskId));
      const res = await archiveTaskAction(cur.taskId, true);
      if (!res.ok) {
        setItems((l) => [...l, ...removed]);
        notify(res.error, { tone: "error" });
        return;
      }
      const restore: UndoEntry = async () => {
        const r = await archiveTaskAction(cur.taskId, false);
        if (!r.ok) { notify(r.error, { tone: "error" }); return; }
        setItems((l) => [...l, ...removed]);
        notify("Restored.");
      };
      pushUndo("Task archived", restore);
    },
    [notify, pushUndo, setItems],
  );

  const create = useCallback(
    async (input: CreateTaskInput): Promise<TaskItem | null> => {
      const res = await createTaskAction(input);
      if (!res.ok) { notify(res.error, { tone: "error" }); return null; }
      const item = res.data;
      setItems((l) => [...l, item]);
      pushUndo(`Added “${item.title}”`, async () => {
        setItems((l) => l.filter((i) => i.taskId !== item.taskId));
        const r = await archiveTaskAction(item.taskId, true);
        if (!r.ok) { setItems((l) => [...l, item]); notify(r.error, { tone: "error" }); return; }
        notify("Task removed.");
      });
      return item;
    },
    [notify, pushUndo, setItems],
  );

  return { items, setStatus, setStatusMany, setTimes, reschedule, setTask, archive, create, undoLast };
}
