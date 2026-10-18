"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { DateTimeField } from "@/components/ui/fields";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/features/auth/components/ui";
import { formatSeconds, instantToLocal, localToInstant, secondsBetween } from "@/lib/time";
import { addTimeEntryAction, deleteTimeEntryAction, listTimeEntriesAction, updateTimeEntryAction, type TimeEntry } from "./actions";
import { useTimer } from "./timer-context";

const toInput = (iso: string, tz: string) => { const l = instantToLocal(iso, tz); return `${l.date}T${l.time}`; };
const fromInput = (v: string, tz: string) => localToInstant(v.slice(0, 10), v.slice(11, 16), tz).toISOString();

/** Lists a task's time entries and lets the owner add past sessions, correct, or delete them. */
export function TimeEntries({ taskId, occurrenceId }: { taskId: string; occurrenceId: string }) {
  const { timezone: tz, emitDelta } = useTimer();
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listTimeEntriesAction(taskId);
    if (r.ok) setEntries(r.data); else setError(r.error);
  }, [taskId]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (e: TimeEntry) => {
    setError(null);
    const r = await deleteTimeEntryAction(e.id);
    if (!r.ok) { setError(r.error); return; }
    if (e.durationSeconds) emitDelta({ taskId: e.taskId, occurrenceId: e.occurrenceId, seconds: -e.durationSeconds });
    setEntries((l) => l?.filter((x) => x.id !== e.id) ?? null);
  };

  return (
    <div className="w-72 space-y-2 p-1">
      {error ? <Alert>{error}</Alert> : null}
      <AddEntry occurrenceId={occurrenceId} onAdded={(e) => { setEntries((l) => [e, ...(l ?? [])].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))); if (e.durationSeconds) emitDelta({ taskId: e.taskId, occurrenceId: e.occurrenceId, seconds: e.durationSeconds }); }} onError={setError} />
      <div className="border-t border-line pt-2">
        {entries === null ? <p className="text-xs text-ink-muted">Loading…</p> : entries.length === 0 ? <p className="text-xs text-ink-muted">No time recorded yet.</p> : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id} className="rounded-control border border-line px-2 py-1.5 text-xs">
                {editing === e.id ? (
                  <EditEntry entry={e} onCancel={() => setEditing(null)} onSaved={(n) => {
                    const before = e.durationSeconds ?? 0, after = n.durationSeconds ?? 0;
                    if (before !== after) emitDelta({ taskId: n.taskId, occurrenceId: n.occurrenceId, seconds: after - before });
                    setEntries((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null); setEditing(null);
                  }} onError={setError} />
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{fmt(e.startedAt, tz)} → {e.endedAt ? fmt(e.endedAt, tz) : "running"}</span>
                      <strong className="font-medium">{e.endedAt ? formatSeconds(e.durationSeconds ?? secondsBetween(e.startedAt, e.endedAt)) : "…"}</strong>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-ink-muted">
                      <span>{e.source === "manual" ? "Manual" : "Timer"}{e.editedAt ? " · edited" : ""}</span>
                      {e.note ? <span className="min-w-0 flex-1 truncate">“{e.note}”</span> : <span className="flex-1" />}
                      <button type="button" onClick={() => setEditing(e.id)} className="hover:text-ink hover:underline">Edit</button>
                      {e.endedAt ? <button type="button" onClick={() => void remove(e)} className="hover:text-danger hover:underline">Delete</button> : null}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const fmt = (iso: string, tz: string) => { const l = instantToLocal(iso, tz); return `${l.date.slice(5)} ${l.time}`; };

function AddEntry({ occurrenceId, onAdded, onError }: { occurrenceId: string; onAdded: (e: TimeEntry) => void; onError: (m: string | null) => void }) {
  const { timezone: tz } = useTimer();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const openForm = () => {
    const nowL = instantToLocal(new Date(), tz);
    const hourAgo = instantToLocal(new Date(Date.now() - 3600_000), tz);
    setStart(`${hourAgo.date}T${hourAgo.time}`); setEnd(`${nowL.date}T${nowL.time}`); setOpen(true);
  };
  if (!open) return <Button type="button" size="small" variant="outlined" color="inherit" fullWidth onClick={openForm} sx={{ borderColor: "divider" }}>Add past time entry…</Button>;

  const bad = start && end && fromInput(end, tz) <= fromInput(start, tz);
  return (
    <form className="space-y-2" onSubmit={async (ev) => {
      ev.preventDefault(); if (bad || busy) return; setBusy(true); onError(null);
      const r = await addTimeEntryAction({ occurrenceId, startedAt: fromInput(start, tz), endedAt: fromInput(end, tz), note: note || null });
      setBusy(false);
      if (r.ok) { onAdded(r.data); setOpen(false); setNote(""); } else onError(r.error);
    }}>
      <DateTimeField label="Start" required value={start} onChange={setStart} fullWidth />
      <DateTimeField label="End" required value={end} onChange={setEnd} fullWidth />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} fullWidth />
      {bad ? <p role="alert" className="text-xs text-danger">End must be after start.</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="small" color="inherit" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="small" variant="contained" disabled={Boolean(bad) || busy}>{busy ? "Saving…" : "Add entry"}</Button>
      </div>
    </form>
  );
}

function EditEntry({ entry, onSaved, onCancel, onError }: { entry: TimeEntry; onSaved: (e: TimeEntry) => void; onCancel: () => void; onError: (m: string | null) => void }) {
  const { timezone: tz } = useTimer();
  const [start, setStart] = useState(toInput(entry.startedAt, tz));
  const [end, setEnd] = useState(entry.endedAt ? toInput(entry.endedAt, tz) : "");
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);
  const bad = end && fromInput(end, tz) <= fromInput(start, tz);
  return (
    <form className="space-y-1.5" onSubmit={async (ev) => {
      ev.preventDefault(); if (bad || busy) return; setBusy(true); onError(null);
      const r = await updateTimeEntryAction({ id: entry.id, startedAt: fromInput(start, tz), endedAt: end ? fromInput(end, tz) : null, note: note || null });
      setBusy(false);
      if (r.ok) onSaved(r.data); else onError(r.error);
    }}>
      <DateTimeField aria-label="Start" required value={start} onChange={setStart} fullWidth />
      {entry.endedAt ? <DateTimeField aria-label="End" required value={end} onChange={setEnd} fullWidth /> : <p className="text-ink-muted">Still running. Stop it to set an end.</p>}
      <TextField placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, "aria-label": "Note" } }} fullWidth />
      {bad ? <p role="alert" className="text-danger">End must be after start.</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="small" color="inherit" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="small" variant="contained" disabled={Boolean(bad) || busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
