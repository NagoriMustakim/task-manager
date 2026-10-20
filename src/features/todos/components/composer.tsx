"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { DateField, SelectField, TimeField } from "@/components/ui/fields";
import { PRIORITIES, PRIORITY_LABEL, type Priority, type Todo } from "../types";
import { createTodoAction } from "../actions";

/** Quick add. Only a title is required; Enter adds the task and keeps the form ready for the next one. */
export function Composer({ defaultDate, onAdded }: { defaultDate: string; onAdded: (t: Todo) => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Exclude<Priority, "none">>("medium");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDate(defaultDate), [defaultDate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const timeBad = Boolean(end && (!start || end <= start));
  const submit = async () => {
    if (!title.trim() || saving || timeBad) return;
    setSaving(true);
    setError(null);
    const r = await createTodoAction({ title, priority, date, start: start || null, end: end || null });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onAdded(r.data);
    setTitle("");
    input.current?.focus();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-2">
        <TextField
          inputRef={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…  (press N)"
          fullWidth
          slotProps={{ htmlInput: { maxLength: 300, "aria-label": "New task title", enterKeyHint: "done" } }}
        />
        <Button type="submit" variant="contained" disabled={!title.trim() || saving || timeBad} sx={{ px: 3 }}>{saving ? "Adding…" : "Add"}</Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SelectField label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} fullWidth />
        <DateField label="Day" value={date} onChange={(d) => d && setDate(d)} required fullWidth />
        <TimeField label="Start" value={start} onChange={setStart} fullWidth />
        <TimeField label="End" value={end} onChange={setEnd} error={timeBad} fullWidth />
      </div>
      {timeBad ? <p role="alert" className="mt-1 text-xs text-danger">End must be after start.</p> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </form>
  );
}
