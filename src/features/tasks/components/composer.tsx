"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCategoryAction } from "../actions";
import { PRIORITIES, PRIORITY_LABEL, type Category, type TaskPriority } from "../types";
import type { useTaskStore } from "../use-task-store";
import AddRounded from "@mui/icons-material/AddRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DateField, SelectField, TimeField } from "@/components/ui/fields";
import { RepeatPicker } from "./repeat-picker";
import { useToast } from "./toast";

type Store = ReturnType<typeof useTaskStore>;
export const NEW_TASK_EVENT = "tracker:new-task";

/**
 * Inline quick-add. Only a title is required. Enter saves and keeps the composer open with
 * the other options retained, so tasks can be added back to back without leaving context.
 */
export function Composer({
  store,
  defaultDate,
  categories: initialCategories,
  onCategoriesChange,
}: {
  store: Store;
  defaultDate: string;
  categories: Category[];
  onCategoriesChange: (c: Category[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [rrule, setRrule] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLFormElement>(null);
  const { notify } = useToast();

  useEffect(() => setDate(defaultDate), [defaultDate]);

  const focus = useCallback(() => {
    wrap.current?.scrollIntoView({ block: "nearest" });
    input.current?.focus();
    setExpanded(true);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      (e as CustomEvent<{ handled: boolean }>).detail.handled = true;
      focus();
    };
    window.addEventListener(NEW_TASK_EVENT, handler);
    if (new URLSearchParams(window.location.search).get("new") === "1") focus();
    return () => window.removeEventListener(NEW_TASK_EVENT, handler);
  }, [focus]);

  const timeError = end && (!start || end <= start) ? "End must be after start." : null;

  const submit = async () => {
    const t = title.trim();
    if (!t || saving || timeError) return;
    setSaving(true);
    const item = await store.create({
      title: t,
      priority,
      date,
      startTime: start || null,
      endTime: end || null,
      categoryId: categoryId || null,
      rrule,
      recurrenceUntil: until,
    });
    setSaving(false);
    if (item) {
      setTitle("");
      if (item.scheduledDate !== defaultDate) notify(`Added to ${item.scheduledDate}`);
      input.current?.focus();
    }
  };

  const addCategory = async () => {
    const res = await createCategoryAction(newCategory ?? "");
    if (!res.ok) { notify(res.error, { tone: "error" }); return; }
    onCategoriesChange([...initialCategories, res.data].sort((a, b) => a.name.localeCompare(b.name)));
    setCategoryId(res.data.id);
    setNewCategory(null);
  };

  return (
    <Paper
      component="form"
      ref={wrap}
      variant="outlined"
      onSubmit={(e: React.FormEvent) => { e.preventDefault(); void submit(); }}
      sx={{ borderColor: expanded ? "primary.main" : "divider", transition: "border-color .15s" }}
    >
      <div className="flex items-center gap-2 p-2.5">
        <TextField
          inputRef={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          fullWidth
          placeholder="Add a task…  press N"
          onKeyDown={(e) => { if (e.key === "Escape") { setExpanded(false); input.current?.blur(); } }}
          slotProps={{
            htmlInput: { maxLength: 500, "aria-label": "New task title", enterKeyHint: "done" },
            input: { startAdornment: (<InputAdornment position="start"><AddRounded fontSize="small" /></InputAdornment>) },
          }}
        />
        <Button type="submit" variant="contained" disabled={!title.trim() || saving || Boolean(timeError)} sx={{ flexShrink: 0, minWidth: 72 }}>
          {saving ? "Adding…" : "Add"}
        </Button>
      </div>
      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5, p: 1.5 }}>
          <SelectField label="Priority" value={priority} onChange={(v) => setPriority(v as TaskPriority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} sx={{ minWidth: 120 }} />
          <DateField label="Date" value={date} onChange={setDate} required sx={{ width: 160 }} />
          <TimeField label="Start" value={start} onChange={setStart} sx={{ width: 130 }} />
          <TimeField label="End" value={end} onChange={setEnd} sx={{ width: 130 }} error={Boolean(timeError)} />
          {newCategory === null ? (
            <SelectField
              label="Category"
              value={categoryId}
              onChange={(v) => (v === "__new__" ? setNewCategory("") : setCategoryId(v))}
              options={[{ value: "", label: "None" }, ...initialCategories.map((c) => ({ value: c.id, label: c.name })), { value: "__new__", label: "New category…" }]}
              sx={{ minWidth: 150 }}
            />
          ) : (
            <div className="flex items-start gap-1">
              <TextField
                autoFocus
                label="New category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void addCategory(); }
                  if (e.key === "Escape") { e.stopPropagation(); setNewCategory(null); }
                }}
                slotProps={{ htmlInput: { maxLength: 60 } }}
                sx={{ width: 160 }}
              />
              <Button type="button" variant="outlined" onClick={() => void addCategory()} disabled={!newCategory.trim()} sx={{ height: 40 }}>Save</Button>
              <Button type="button" color="inherit" onClick={() => setNewCategory(null)} sx={{ height: 40 }}>Cancel</Button>
            </div>
          )}
          <RepeatPicker startDate={date} onChange={(r, u) => { setRrule(r); setUntil(u); }} />
          {timeError ? <Typography role="alert" variant="caption" color="error" sx={{ width: "100%" }}>{timeError}</Typography> : null}
        </Box>
      </Collapse>
    </Paper>
  );
}
