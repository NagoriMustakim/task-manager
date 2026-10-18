"use client";

import Button from "@mui/material/Button";
import { useState, useTransition } from "react";
import { DateField, TimeField } from "@/components/ui/fields";
import { Alert } from "@/features/auth/components/ui";
import { RepeatPicker } from "@/features/tasks/components/repeat-picker";
import { updateRecurrenceAction } from "./actions";

export function RoutineEditor({ taskId, today, startTime, endTime }: { taskId: string; today: string; startTime: string | null; endTime: string | null }) {
  const [from, setFrom] = useState(today);
  const [rule, setRule] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [start, setStart] = useState(startTime ?? "");
  const [end, setEnd] = useState(endTime ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  const badTime = Boolean(end && (!start || end <= start));

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rule || badTime) return;
        go(async () => {
          const r = await updateRecurrenceAction({ taskId, rule, from, until, startTime: start || null, endTime: end || null });
          setMsg(r.ok ? { ok: true, text: `Saved. New rule applies from ${from}; earlier entries were not changed (${r.data.removed} untouched future ${r.data.removed === 1 ? "entry" : "entries"} regenerated).` } : { ok: false, text: r.error });
        });
      }}
    >
      {msg ? <Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
      <p className="text-xs text-ink-muted">Changes apply from the date below. Past occurrences and anything you already updated keep their history.</p>
      <div className="flex flex-wrap items-end gap-3">
        <DateField label="Applies from" min={today} required value={from} onChange={setFrom} sx={{ width: 170 }} />
        <TimeField label="Start" value={start} onChange={setStart} sx={{ width: 130 }} />
        <TimeField label="End" value={end} onChange={setEnd} sx={{ width: 130 }} />
        <RepeatPicker startDate={from} onChange={(r, u) => { setRule(r); setUntil(u); }} />
      </div>
      {badTime ? <p role="alert" className="text-xs text-danger">End must be after start.</p> : null}
      {!rule ? <p className="text-xs text-ink-muted">Choose how it should repeat to enable saving.</p> : null}
      <Button type="submit" variant="contained" size="small" disabled={pending || !rule || badTime}>{pending ? "Saving…" : "Save new schedule"}</Button>
    </form>
  );
}
