"use client";

import MuiAlert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div aria-hidden className="mb-4 size-6 rounded-md bg-accent" />
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-ink-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">{children}</div>
      </div>
    </main>
  );
}

export function Field({
  label,
  error,
  name,
  type,
  required,
  defaultValue,
  placeholder,
  autoComplete,
  ...props
}: { label: string; error?: string | undefined } & ComponentProps<"input">) {
  const id = `f-${name}`;
  return (
    <TextField
      id={id}
      name={name}
      label={label}
      type={type}
      required={required}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autoComplete={autoComplete}
      error={Boolean(error)}
      helperText={error}
      fullWidth
      slotProps={{ htmlInput: props as Record<string, unknown>, formHelperText: { id: `${id}-err` } }}
    />
  );
}

export function SubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="contained" fullWidth disabled={pending} sx={{ height: 40 }}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success"; children: ReactNode }) {
  return (
    <MuiAlert severity={kind} role={kind === "error" ? "alert" : "status"} sx={{ py: 0.25, fontSize: 13 }}>
      {children}
    </MuiAlert>
  );
}
