"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useState, useTransition, type ReactNode } from "react";
import type { AiResult } from "../actions";

/** Runs an AI action, tracking loading and a safe error message. */
export function useAiCall<A extends unknown[], T>(fn: (...a: A) => Promise<AiResult<T>>) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (...a: A) =>
    start(async () => {
      setError(null);
      const r = await fn(...a);
      if (r.ok) setData(r.data);
      else setError(r.retryAfterSeconds ? `${r.error} (try again in ${Math.ceil(r.retryAfterSeconds / 60)} min)` : r.error);
    });
  return { run, pending, data, error, clear: () => { setData(null); setError(null); } };
}

export function AiNotConfigured({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`rounded-control border border-dashed border-line-strong text-ink-muted ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-[13px]"}`}>
      AI assistant isn&apos;t set up. Add <code className="rounded bg-canvas px-1">GEMINI_API_KEY</code> and{" "}
      <code className="rounded bg-canvas px-1">GEMINI_MODEL</code> to the server environment (see docs/ai-assistant.md). Everything else works without it.
    </p>
  );
}

export function AiButton({ onClick, pending, children, disabled }: { onClick: () => void; pending: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <Button type="button" size="small" variant="outlined" onClick={onClick} disabled={pending || disabled}>
      {pending ? "Thinking…" : children}
    </Button>
  );
}

export function AiError({ message }: { message: string | null }) {
  return message ? <Alert severity="error" role="alert" sx={{ py: 0 }}>{message}</Alert> : null;
}

export function AiWarning({ children }: { children: ReactNode }) {
  return <Alert severity="warning" role="status" sx={{ py: 0 }}>{children}</Alert>;
}

export function Suggestion({ children, onAccept, acceptLabel = "Accept", onDismiss, disabled }: { children: ReactNode; onAccept?: () => void; acceptLabel?: string; onDismiss: () => void; disabled?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
      <div className="min-w-0 flex-1">{children}</div>
      {onAccept ? <Button type="button" size="small" variant="contained" disabled={disabled} onClick={onAccept}>{acceptLabel}</Button> : null}
      <Button type="button" size="small" color="inherit" onClick={onDismiss}>Dismiss</Button>
    </li>
  );
}

export const AI_NOTE = "AI suggestions may be wrong. Nothing changes until you accept it.";
