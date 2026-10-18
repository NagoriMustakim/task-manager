"use client";

import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { useState } from "react";
import { DateField, SelectField } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";
import { EXPORT_KINDS, KIND_LABEL, type ExportKind } from "./csv";

const HELP: Record<ExportKind, string> = {
  tasks: "Tasks created in the range (title, description, priority, category, deadline, estimate, repeat rule).",
  occurrences: "Every scheduled occurrence in the range with status, completion, move details and recorded time.",
  history: "The change log (status changes, reschedules, priority/deadline edits) in the range.",
  time: "Time entries overlapping the range, including manual and corrected entries.",
  daily: "One row per day: scheduled, due, done, rates, estimated and recorded minutes, carry-forwards.",
  weekly: "One row per week, summed from the daily figures.",
};

type State = { s: "idle" } | { s: "working" } | { s: "done"; rows: number; filename: string } | { s: "error"; message: string };

/** Downloads through fetch so failures show a readable message instead of a broken file. */
export function ExportForm({ today }: { today: string }) {
  const [kind, setKind] = useState<ExportKind>("occurrences");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [state, setState] = useState<State>({ s: "idle" });

  const presets: [string, string, string][] = [
    ["Last 7 days", addDays(today, -6), today],
    ["Last 30 days", addDays(today, -29), today],
    ["This month", `${today.slice(0, 7)}-01`, today],
    ["This year", `${today.slice(0, 4)}-01-01`, today],
  ];

  const download = async () => {
    setState({ s: "working" });
    try {
      const res = await fetch(`/api/export/${kind}?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setState({ s: "error", message: body?.error ?? "The export failed. Try again." });
        return;
      }
      const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `tracker-${kind}.csv`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setState({ s: "done", rows: Number(res.headers.get("X-Row-Count") ?? 0), filename });
    } catch {
      setState({ s: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  };

  return (
    <form className="max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); void download(); }}>
      <SelectField label="What to export" value={kind} onChange={(v) => setKind(v as ExportKind)} options={EXPORT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} fullWidth />
      <p className="-mt-2 text-xs text-ink-muted">{HELP[kind]}</p>
      <div className="flex flex-wrap items-end gap-3">
        <DateField label="From" required value={from} max={to} onChange={setFrom} sx={{ width: 170 }} />
        <DateField label="To" required value={to} min={from} onChange={setTo} sx={{ width: 170 }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, f, t]) => (<Chip key={label} label={label} variant="outlined" onClick={() => { setFrom(f); setTo(t); }} />))}
      </div>
      <Button type="submit" variant="contained" disabled={state.s === "working"}>
        {state.s === "working" ? "Preparing…" : "Download CSV"}
      </Button>
      <div aria-live="polite" className="text-[13px]">
        {state.s === "done" ? (
          <p className="text-success">
            Downloaded <strong>{state.filename}</strong>: {state.rows === 0 ? "no rows in this range (the file contains only the header)." : `${state.rows.toLocaleString()} ${state.rows === 1 ? "row" : "rows"}.`}
          </p>
        ) : null}
        {state.s === "error" ? <p role="alert" className="text-danger">{state.message}</p> : null}
      </div>
      <p className="text-xs text-ink-muted">Dates and times use your timezone. Text that could run as a spreadsheet formula (starting with = + - @) is prefixed with an apostrophe. Maximum range: 366 days.</p>
    </form>
  );
}
