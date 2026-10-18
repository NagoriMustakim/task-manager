"use client";

import { useMemo, useState } from "react";
import { relativeDateLabel } from "@/lib/dates";
import type { TaskItem } from "@/features/tasks/types";
import type { useTaskStore } from "@/features/tasks/use-task-store";
import { aiCarryForwardAction, aiParseTaskAction, aiPlanDayAction } from "../actions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { DateField, SelectField, TimeField } from "@/components/ui/fields";
import { AI_NOTE, AiButton, AiError, AiNotConfigured, AiWarning, Suggestion, useAiCall } from "./ai-ui";

type Store = ReturnType<typeof useTaskStore>;

/** Compact assistant for the daily planner: plan the day, carry-forward advice, and natural-language entry. */
export function AiPanel({ store, configured, date, today }: { store: Store; configured: boolean; date: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="AI assistant" className="rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-11 w-full cursor-pointer items-center justify-between px-4 text-[13px] font-medium">
        <span>AI assistant</span>
        <span className="text-xs font-normal text-ink-muted">{open ? "Hide" : "Plan, carry forward, add by sentence"}</span>
      </button>
      {open ? (
        <div className="space-y-5 border-t border-line px-4 py-4">
          {!configured ? <AiNotConfigured /> : (
            <>
              <NaturalEntry store={store} date={date} />
              <PlanSection store={store} date={date} today={today} />
              <CarrySection store={store} date={date} today={today} />
              <p className="text-[11px] text-ink-muted">{AI_NOTE}</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function titleOf(items: TaskItem[], id: string) {
  return items.find((i) => i.id === id)?.title ?? "Task";
}

function PlanSection({ store, date, today }: { store: Store; date: string; today: string }) {
  const call = useAiCall(aiPlanDayAction);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Record<string, { start: string; end: string }>>({});
  const hide = (id: string) => setDismissed((s) => new Set(s).add(id));
  const d = call.data;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">Suggest a plan for the day</h3>
        <AiButton pending={call.pending} onClick={() => { setDismissed(new Set()); setEdited({}); call.run({ date }); }}>Suggest plan</AiButton>
      </div>
      <AiError message={call.error} />
      {d ? (
        <div className="space-y-2">
          <p className="text-[13px]">{d.summary}</p>
          <p className="text-xs text-ink-muted">{d.plannedMinutes} min planned of {d.availableMinutes} min available{d.cached ? " · cached" : ""}</p>
          {d.overloaded ? <AiWarning>Overloaded: {d.overloadReason ?? "more work than time."}</AiWarning> : null}
          {d.blocks.length ? (
            <ul className="space-y-1.5" aria-label="Suggested schedule">
              {d.blocks.filter((b) => !dismissed.has(b.id)).map((b) => {
                const t = edited[b.id] ?? { start: b.start, end: b.end };
                const bad = t.end <= t.start;
                return (
                  <Suggestion key={b.id} acceptLabel="Set time" disabled={bad} onDismiss={() => hide(b.id)} onAccept={() => { void store.setTimes(b.id, { startTime: t.start, endTime: t.end }); hide(b.id); }}>
                    <p className="truncate font-medium">{titleOf(store.items, b.id)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <TimeField aria-label="Start" value={t.start} onChange={(v) => setEdited((x) => ({ ...x, [b.id]: { ...t, start: v } }))} sx={{ width: 120 }} />
                      <span aria-hidden>–</span>
                      <TimeField aria-label="End" value={t.end} onChange={(v) => setEdited((x) => ({ ...x, [b.id]: { ...t, end: v } }))} sx={{ width: 120 }} />
                      {b.note ? <span className="truncate text-xs text-ink-muted">{b.note}</span> : null}
                    </div>
                  </Suggestion>
                );
              })}
            </ul>
          ) : null}
          {d.defer.length ? (
            <>
              <h4 className="pt-1 text-xs font-medium">Consider deferring</h4>
              <ul className="space-y-1.5">
                {d.defer.filter((x) => !dismissed.has(x.id)).map((x) => (
                  <Suggestion key={x.id} acceptLabel={`Move to ${relativeDateLabel(x.date, today)}`} onDismiss={() => hide(x.id)} onAccept={() => { void store.reschedule({ ids: [x.id], date: x.date, keepTime: true, reason: "Deferred (AI suggestion)" }); hide(x.id); }}>
                    <p className="truncate font-medium">{titleOf(store.items, x.id)}</p>
                    <p className="text-xs text-ink-muted">{x.reason}</p>
                  </Suggestion>
                ))}
              </ul>
            </>
          ) : null}
          {d.tips.length ? <ul className="list-disc pl-5 text-xs text-ink-muted">{d.tips.map((t, i) => (<li key={i}>{t}</li>))}</ul> : null}
          {d.dropped > 0 ? <p className="text-[11px] text-ink-muted">{d.dropped} suggestion(s) were discarded because they didn&apos;t fit your working hours or tasks.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function CarrySection({ store, date, today }: { store: Store; date: string; today: string }) {
  const call = useAiCall(aiCarryForwardAction);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dest, setDest] = useState<Record<string, string>>({});
  const d = call.data;
  const hide = (id: string) => setDismissed((s) => new Set(s).add(id));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">Where should unfinished tasks go?</h3>
        <AiButton pending={call.pending} onClick={() => { setDismissed(new Set()); call.run({ date: date > today ? today : date }); }}>Recommend</AiButton>
      </div>
      <AiError message={call.error} />
      {d ? (
        <>
          {d.note ? <p className="text-xs text-ink-muted">{d.note}</p> : null}
          <ul className="space-y-1.5">
            {d.items.filter((x) => !dismissed.has(x.id)).map((x) => {
              const target = dest[x.id] ?? x.date;
              return (
                <Suggestion key={x.id} acceptLabel={`Move to ${relativeDateLabel(target, today)}`} onDismiss={() => hide(x.id)} onAccept={() => { void store.reschedule({ ids: [x.id], date: target, keepTime: true, reason: "AI suggestion" }); hide(x.id); }}>
                  <p className="truncate font-medium">{titleOf(store.items, x.id)}</p>
                  <p className="text-xs text-ink-muted">{x.reason}</p>
                  <div className="mt-1.5"><DateField label="Date" min={today} value={target} onChange={(v) => v && setDest((m) => ({ ...m, [x.id]: v }))} sx={{ width: 160 }} /></div>
                </Suggestion>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function NaturalEntry({ store, date }: { store: Store; date: string }) {
  const [text, setText] = useState("");
  const call = useAiCall(aiParseTaskAction);
  const [draft, setDraft] = useState<NonNullable<typeof call.data>["draft"] | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = call.data?.draft;
  const d = draft ?? parsed ?? null;
  const invalidTime = useMemo(() => Boolean(d?.endTime && (!d.startTime || d.endTime <= d.startTime)), [d]);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold">Add a task by describing it</h3>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) { setDraft(null); call.run({ text }); } }}>
        <TextField value={text} onChange={(e) => setText(e.target.value)} fullWidth placeholder="Finish the API integration tomorrow at 3 PM, high priority, 90 minutes" slotProps={{ htmlInput: { maxLength: 500, "aria-label": "Describe a task" } }} />
        <Button type="submit" variant="outlined" disabled={call.pending} sx={{ flexShrink: 0 }}>{call.pending ? "Thinking…" : "Parse"}</Button>
      </form>
      <AiError message={call.error} />
      {d ? (
        <div className="space-y-3 rounded-xl border border-line p-3">
          {d.ambiguities.length ? (
            <AiWarning>
              <ul>{d.ambiguities.map((a, i) => (<li key={i}>{a}</li>))}</ul>
            </AiWarning>
          ) : null}
          <TextField label="Title" value={d.title} onChange={(e) => setDraft({ ...d, title: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
          <div className="flex flex-wrap gap-2">
            <DateField label="Date" value={d.date ?? ""} onChange={(v) => setDraft({ ...d, date: v || null })} sx={{ width: 170 }} />
            <TimeField label="Start" value={d.startTime ?? ""} onChange={(v) => setDraft({ ...d, startTime: v || null })} sx={{ width: 130 }} />
            <TimeField label="End" value={d.endTime ?? ""} onChange={(v) => setDraft({ ...d, endTime: v || null })} sx={{ width: 130 }} />
            <TextField label="Minutes" type="number" value={d.durationMinutes ?? ""} onChange={(e) => setDraft({ ...d, durationMinutes: e.target.value ? Number(e.target.value) : null })} slotProps={{ htmlInput: { min: 1, max: 1440 } }} sx={{ width: 100 }} />
            <SelectField
              label="Priority"
              value={d.priority ?? ""}
              onChange={(v) => setDraft({ ...d, priority: (v || null) as typeof d.priority })}
              options={[{ value: "", label: "Default (medium)" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]}
              sx={{ minWidth: 160 }}
            />
          </div>
          {invalidTime ? <p role="alert" className="text-xs text-danger">End must be after start.</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="small" color="inherit" onClick={() => { setDraft(null); call.clear(); }}>Discard</Button>
            <Button
              type="button"
              size="small"
              variant="contained"
              disabled={saving || invalidTime || !d.title.trim() || !d.date}
              title={!d.date ? "Choose a date first" : undefined}
              onClick={async () => {
                setSaving(true);
                const item = await store.create({ title: d.title, date: d.date ?? date, priority: d.priority ?? "medium", startTime: d.startTime, endTime: d.endTime, estimatedMinutes: d.durationMinutes });
                setSaving(false);
                if (item) { setText(""); setDraft(null); call.clear(); }
              }}
            >
              {saving ? "Creating…" : "Create task"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
