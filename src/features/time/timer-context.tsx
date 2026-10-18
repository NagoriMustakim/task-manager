"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/features/tasks/components/toast";
import { secondsBetween } from "@/lib/time";
import { startTimerAction, stopTimerAction, syncTimerAction } from "./actions";
import type { ActiveTimer } from "./queries";

export interface TrackedDelta { taskId: string; occurrenceId: string | null; seconds: number }

interface TimerApi {
  active: ActiveTimer | null;
  elapsedSeconds: number;
  busy: boolean;
  timezone: string;
  start: (target: { occurrenceId: string; taskId: string; title: string }) => Promise<void>;
  stop: () => Promise<void>;
  /** Manual add/edit/delete report changes here so lists update without a reload. */
  emitDelta: (d: TrackedDelta) => void;
  subscribe: (fn: (d: TrackedDelta) => void) => () => void;
}

const Ctx = createContext<TimerApi | null>(null);
export const useTimer = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTimer must be used inside <TimerProvider>");
  return v;
};

/**
 * Holds the running timer. The source of truth is the database row's `started_at`:
 * elapsed = (browser clock + server offset) - started_at, recomputed on every tick and whenever
 * the tab becomes visible again, so throttled intervals, sleep, or a skewed device clock cannot
 * make the display drift. State is re-read from the server on focus/online/visibility.
 */
export function TimerProvider({
  initial, serverNow, timezone, children,
}: { initial: ActiveTimer | null; serverNow: string; timezone: string; children: ReactNode }) {
  const [active, setActive] = useState(initial);
  const [offset, setOffset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const listeners = useRef(new Set<(d: TrackedDelta) => void>());
  const busyRef = useRef(false);
  const { notify } = useToast();

  const emitDelta = useCallback((d: TrackedDelta) => listeners.current.forEach((fn) => fn(d)), []);
  const subscribe = useCallback((fn: (d: TrackedDelta) => void) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);

  const resync = useCallback(async () => {
    const r = await syncTimerAction();
    if (!r.ok) return;
    setActive(r.data.timer);
    setOffset(Date.parse(r.data.serverNow) - Date.now());
    setNow(Date.now());
  }, []);

  // Tick only while a timer runs.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void resync(); } };
    const onOnline = () => void resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
  }, [resync]);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return; // duplicate click / key repeat
    busyRef.current = true; setBusy(true);
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  }, []);

  const start: TimerApi["start"] = useCallback((target) => guard(async () => {
    const r = await startTimerAction(target.occurrenceId);
    if (!r.ok) { notify(r.error, { tone: "error" }); void resync(); return; }
    const { started, stopped, serverNow: sn } = r.data;
    setOffset(Date.parse(sn) - Date.now());
    setNow(Date.now());
    setActive({ sessionId: started.id, taskId: started.taskId, occurrenceId: started.occurrenceId, title: target.title, startedAt: started.startedAt });
    if (stopped?.durationSeconds) {
      emitDelta({ taskId: stopped.taskId, occurrenceId: stopped.occurrenceId, seconds: stopped.durationSeconds });
      notify("Switched timer. The previous one was saved.");
    }
  }), [guard, notify, resync, emitDelta]);

  const stop: TimerApi["stop"] = useCallback(() => guard(async () => {
    const r = await stopTimerAction({ sessionId: active?.sessionId ?? null });
    if (!r.ok) {
      notify(r.error, { tone: "error" }); // timer stays shown: it is still running on the server
      void resync();
      return;
    }
    const s = r.data.stopped;
    setActive(null);
    if (s.durationSeconds) emitDelta({ taskId: s.taskId, occurrenceId: s.occurrenceId, seconds: s.durationSeconds });
  }), [active, guard, notify, resync, emitDelta]);

  const elapsedSeconds = active ? secondsBetween(active.startedAt, new Date(now + offset)) : 0;
  const value = useMemo<TimerApi>(
    () => ({ active, elapsedSeconds, busy, timezone, start, stop, emitDelta, subscribe }),
    [active, elapsedSeconds, busy, timezone, start, stop, emitDelta, subscribe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
