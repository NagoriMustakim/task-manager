"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { DateField } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";

export interface MoveChoice { date: string; keepTime: boolean; reason: string | null }

/** Date + preserve/clear time + optional reason: shared by the bulk bar and the rollover review. */
export function MoveForm({ today, count, onSubmit, busy }: { today: string; count: number; onSubmit: (c: MoveChoice) => void; busy: boolean }) {
  const [date, setDate] = useState(addDays(today, 1));
  const [keepTime, setKeepTime] = useState(true);
  const [reason, setReason] = useState("");
  return (
    <form className="flex w-72 max-w-full flex-col gap-3 p-1.5" onSubmit={(e) => { e.preventDefault(); if (date >= today) onSubmit({ date, keepTime, reason: reason.trim() || null }); }}>
      <DateField label="Move to" required min={today} value={date} onChange={setDate} autoFocus fullWidth />
      <FormControlLabel
        control={<Checkbox size="small" checked={keepTime} onChange={(e) => setKeepTime(e.target.checked)} />}
        label={<Typography variant="caption">Keep scheduled times (otherwise they become all-day)</Typography>}
      />
      <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. blocked, re-prioritised" slotProps={{ htmlInput: { maxLength: 280 } }} fullWidth />
      <Button type="submit" variant="contained" disabled={busy || count === 0} fullWidth>
        {busy ? "Moving…" : `Move ${count} ${count === 1 ? "task" : "tasks"}`}
      </Button>
    </form>
  );
}
