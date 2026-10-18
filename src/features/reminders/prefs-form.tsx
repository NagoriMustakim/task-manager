"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { useState, useTransition } from "react";
import { SelectField, TimeField } from "@/components/ui/fields";
import { Alert } from "@/features/auth/components/ui";
import { updateReminderPrefsAction } from "./actions";
import { validatePrefs, type ReminderPrefs } from "./evaluate";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ReminderPrefsForm({ initial }: { initial: ReminderPrefs }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  const set = <K extends keyof ReminderPrefs>(k: K, v: ReminderPrefs[K]) => setP((x) => ({ ...x, [k]: v }));
  const off = !p.enabled;
  const invalid = validatePrefs(p);


  const Toggle = ({ k, label, children }: { k: "taskStart" | "deadline" | "overdueHigh" | "morning" | "endOfDay" | "weekly"; label: string; children?: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <FormControlLabel sx={{ minWidth: 224 }} control={<Checkbox size="small" disabled={off} checked={p[k]} onChange={(e) => set(k, e.target.checked)} />} label={<span className="text-[13px]">{label}</span>} />
      {children}
    </div>
  );

  return (
    <form className="max-w-xl" onSubmit={(e) => { e.preventDefault(); if (invalid) return; go(async () => { const r = await updateReminderPrefsAction(p); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); }); }}>
      {msg ? <div className="mb-3"><Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert></div> : null}
      <FormControlLabel control={<Switch checked={p.enabled} onChange={(e) => set("enabled", e.target.checked)} />} label={<span className="text-[13px] font-medium">Reminders on</span>} />
      <p className="mb-2 mt-1 text-xs text-ink-muted">Reminders appear in the bell while the app is open and visible. Closed-app delivery (email or push) isn&apos;t set up.</p>
      <div className="divide-y divide-line rounded-lg border border-line bg-surface px-3">
        <Toggle k="taskStart" label="Upcoming task start times">
          <TextField label="Minutes before" type="number" slotProps={{ htmlInput: { min: 0, max: 240 } }} disabled={off || !p.taskStart} value={p.startLeadMin} onChange={(e) => set("startLeadMin", Number(e.target.value))} sx={{ width: 140 }} />
        </Toggle>
        <Toggle k="deadline" label="Approaching deadlines">
          <TextField label="Days ahead" type="number" slotProps={{ htmlInput: { min: 0, max: 14 } }} disabled={off || !p.deadline} value={p.deadlineDays} onChange={(e) => set("deadlineDays", Number(e.target.value))} sx={{ width: 120 }} />
        </Toggle>
        <Toggle k="overdueHigh" label="Overdue high-priority tasks" />
        <Toggle k="morning" label="Morning planning">
          <TimeField label="At" disabled={off || !p.morning} value={p.morningTime} onChange={(v) => set("morningTime", v)} sx={{ width: 130 }} />
        </Toggle>
        <Toggle k="endOfDay" label="End-of-day review">
          <TimeField label="At" disabled={off || !p.endOfDay} value={p.eodTime} onChange={(v) => set("eodTime", v)} sx={{ width: 130 }} />
        </Toggle>
        <Toggle k="weekly" label="Weekly review">
          <SelectField label="On" disabled={off || !p.weekly} value={p.weeklyDay} onChange={(v) => set("weeklyDay", Number(v))} options={DAYS.map((d, i) => ({ value: i, label: d }))} sx={{ minWidth: 150 }} />
          <TimeField label="At" disabled={off || !p.weekly} value={p.weeklyTime} onChange={(v) => set("weeklyTime", v)} sx={{ width: 130 }} />
        </Toggle>
      </div>
      {invalid ? <p role="alert" className="mt-2 text-xs text-danger">{invalid}</p> : null}
      <Button type="submit" variant="contained" disabled={pending || Boolean(invalid)} sx={{ mt: 2 }}>{pending ? "Saving…" : "Save reminder settings"}</Button>
    </form>
  );
}
