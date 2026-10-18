"use client";

import Button from "@mui/material/Button";
import { useState, useTransition } from "react";
import { TimeField } from "@/components/ui/fields";
import { Alert } from "@/features/auth/components/ui";
import { updateWorkHoursAction } from "@/features/tasks/actions";

export function WorkHoursForm({ start: s0, end: e0 }: { start: string; end: string }) {
  const [start, setStart] = useState(s0);
  const [end, setEnd] = useState(e0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  return (
    <form className="max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await updateWorkHoursAction(start, end); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); }); }}>
      {msg ? <Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
      <div className="flex gap-3">
        <TimeField label="Work starts" required value={start} onChange={setStart} fullWidth />
        <TimeField label="Work ends" required value={end} onChange={setEnd} fullWidth />
      </div>
      <p className="text-xs text-ink-muted">Used by the AI planner to fit tasks into your day.</p>
      <Button type="submit" variant="contained" disabled={pending || end <= start}>{pending ? "Saving…" : "Save working hours"}</Button>
    </form>
  );
}
