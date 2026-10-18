"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, useTransition } from "react";
import { updateTimezoneAction } from "../actions";
import { Alert } from "@/features/auth/components/ui";

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = zones.includes(value);

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null); setSaved(null);
        start(async () => {
          const r = await updateTimezoneAction(value);
          if (r.ok) setSaved(`Saved. Today is now ${r.data.today} for you.`); else setError(r.error);
        });
      }}
    >
      {error ? <Alert>{error}</Alert> : null}
      {saved ? <Alert kind="success">{saved}</Alert> : null}
      <Autocomplete
        options={zones}
        value={value}
        onChange={(_, v) => { if (v) setValue(v); }}
        onInputChange={(_, v, reason) => { if (reason === "input") setValue(v); }}
        disableClearable
        freeSolo
        renderInput={(params) => <TextField {...params} label="Timezone" error={!valid} />}
      />
      <p className="text-xs text-ink-muted">
        Changing your timezone only changes which calendar day counts as &ldquo;today&rdquo;. Scheduled dates, history and
        repeating tasks keep their calendar dates, and times of day stay as you entered them.
      </p>
      <Button type="submit" variant="contained" disabled={pending || !valid || value === current}>
        {pending ? "Saving…" : "Save timezone"}
      </Button>
    </form>
  );
}
