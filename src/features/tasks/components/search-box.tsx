"use client";

import ClearRounded from "@mui/icons-material/ClearRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const DEBOUNCE_MS = 250;

/** Search-as-you-type: the list updates shortly after typing stops; Enter applies it immediately. */
export function SearchBox({ initial, status }: { initial: string; status?: string | undefined }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const applied = useRef(initial);
  const timer = useRef<number | undefined>(undefined);

  const apply = (q: string) => {
    const next = q.trim().slice(0, 100);
    if (next === applied.current) return;
    applied.current = next;
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (next) p.set("q", next);
    const qs = p.toString();
    start(() => router.replace(qs ? `/all?${qs}` : "/all", { scroll: false }));
  };

  const onChange = (q: string) => {
    setValue(q);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply(q), DEBOUNCE_MS);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <form role="search" className="flex-1 basis-56" onSubmit={(e) => { e.preventDefault(); window.clearTimeout(timer.current); apply(value); }}>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search tasks…"
        fullWidth
        slotProps={{
          htmlInput: { maxLength: 100, "aria-label": "Search tasks", "aria-busy": pending },
          input: {
            startAdornment: (<InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>),
            endAdornment: value ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => { setValue(""); window.clearTimeout(timer.current); apply(""); }}><ClearRounded fontSize="small" /></IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />
    </form>
  );
}
