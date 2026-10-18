"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface ToastItem { id: number; message: string; tone: "info" | "error"; undo?: (() => void) | undefined }
interface ToastApi {
  notify: (message: string, opts?: { undo?: () => void; tone?: "info" | "error" }) => void;
}

const Ctx = createContext<ToastApi | null>(null);
export const useToast = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const notify = useCallback<ToastApi["notify"]>((message, opts) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, message, tone: opts?.tone ?? "info", undo: opts?.undo }]);
    window.setTimeout(() => dismiss(id), opts?.undo ? 8000 : 5000);
  }, [dismiss]);
  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border px-3 py-2 text-[13px] shadow-sm ${t.tone === "error" ? "border-danger/30 bg-danger-bg text-danger" : "border-line-strong bg-ink text-canvas"}`}>
            <span>{t.message}</span>
            {t.undo ? <UndoButton onClick={() => { t.undo?.(); dismiss(t.id); }} /> : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function UndoButton({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { /* keep reachable by keyboard via Z shortcut as well */ }, []);
  return (
    <button ref={ref} onClick={onClick} className="rounded px-1.5 py-0.5 font-medium underline underline-offset-2 hover:bg-canvas/20">
      Undo
    </button>
  );
}
