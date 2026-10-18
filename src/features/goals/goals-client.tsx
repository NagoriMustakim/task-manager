"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import { useState, useTransition } from "react";
import { DateField, SelectField } from "@/components/ui/fields";
import { Alert } from "@/features/auth/components/ui";
import { addMilestoneAction, createGoalAction, linkTaskToGoalAction, setGoalStatusAction, toggleMilestoneAction } from "./actions";
import { milestoneState } from "./period";
import type { GoalView } from "./queries";

export function GoalForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const period = String(fd.get("period"));
        const target = String(fd.get("target") ?? "");
        start(async () => {
          const r = await createGoalAction({ title: String(fd.get("title") ?? ""), description: String(fd.get("description") ?? "") || null, period: period === "none" ? null : (period as "weekly" | "monthly"), targetCount: target ? Number(target) : null });
          if (r.ok) { setError(null); form.reset(); } else setError(r.error);
        });
      }}
    >
      {error ? <div className="sm:col-span-4"><Alert>{error}</Alert></div> : null}
      <TextField name="title" label="New goal" required placeholder="e.g. Ship the onboarding flow" slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
      <div className="sm:col-span-4"><TextField name="description" label="Description (optional)" multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} fullWidth /></div>
      <SelectField name="period" label="Period" defaultValue="weekly" options={[{ value: "weekly", label: "This week" }, { value: "monthly", label: "This month" }, { value: "none", label: "No period" }]} sx={{ minWidth: 150 }} />
      <TextField name="target" label="Target (optional)" type="number" placeholder="tasks" slotProps={{ htmlInput: { min: 1, max: 10000 } }} sx={{ width: 160 }} />
      <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: "end", height: 40 }}>{pending ? "Adding…" : "Add goal"}</Button>
    </form>
  );
}

const STATE_STYLE = { done: "text-ink-muted line-through", overdue: "text-danger", upcoming: "", undated: "" } as const;

export function GoalCard({ goal, today, history = false }: { goal: GoalView; today: string; history?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = goal.progress;
  const overdue = goal.milestones.filter((m) => milestoneState(m, today) === "overdue").length;
  const doneMs = goal.milestones.filter((m) => m.completedAt).length;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setError(r.ok ? null : (r.error ?? "Failed")); });
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{goal.title}</h3>
          <p className="text-xs text-ink-muted">
            {goal.period ? `${goal.period === "weekly" ? "Week of" : "Month of"} ${goal.periodStart}` : "No period"}
            {goal.status !== "active" ? ` · ${goal.status}` : ""}
            {goal.targetCount ? ` · target ${goal.targetCount}` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="small" variant="outlined" color="inherit" onClick={() => run(() => setGoalStatusAction(goal.id, goal.status === "completed" ? "active" : "completed"))} disabled={pending} sx={{ borderColor: "divider" }}>{goal.status === "completed" ? "Reopen" : "Mark complete"}</Button>
          {goal.status !== "archived" ? <Button size="small" variant="outlined" color="inherit" onClick={() => run(() => setGoalStatusAction(goal.id, "archived"))} disabled={pending} sx={{ borderColor: "divider" }}>Archive</Button> : <Button size="small" variant="outlined" color="inherit" onClick={() => run(() => setGoalStatusAction(goal.id, "active"))} disabled={pending} sx={{ borderColor: "divider" }}>Restore</Button>}
        </div>
      </div>
      {goal.description ? <p className="mt-2 whitespace-pre-line text-[13px] text-ink-muted">{goal.description}</p> : null}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-ink-muted"><span>{p.completed} of {p.target ?? p.instances} {p.target ? "target" : "task instances"}</span><span>{p.percent === null ? "No linked work yet" : `${p.percent}%`}</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent ?? 0} aria-label={`${goal.title} progress`}>
          <div className="h-full rounded-full bg-success" style={{ width: `${p.percent ?? 0}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-ink-muted">A task that was rescheduled counts once.{history ? " Final figures for this goal." : ""}</p>
      </div>
      {error ? <div className="mt-2"><Alert>{error}</Alert></div> : null}

      <details className="mt-3 text-[13px]" open={goal.linked.length > 0 && !history}>
        <summary className="cursor-pointer text-xs font-medium">Linked tasks ({goal.linked.length})</summary>
        {goal.linked.length === 0 ? <p className="mt-1 text-xs text-ink-muted">Link a task from its details panel (Goal).</p> : (
          <ul className="mt-1 divide-y divide-line">
            {goal.linked.map((t) => (
              <li key={t.taskId} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">{t.completed}/{t.instances}
                  {!history ? <button disabled={pending} onClick={() => run(() => linkTaskToGoalAction(t.taskId, null))} className="hover:text-danger hover:underline">Unlink</button> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="mt-3">
        <p className="text-xs font-medium">Milestones <span className="font-normal text-ink-muted">· {doneMs}/{goal.milestones.length} done{overdue ? `, ${overdue} overdue` : ""}</span></p>
        <ul className="mt-1 space-y-1">
          {goal.milestones.map((m) => {
            const st = milestoneState(m, today);
            return (
              <li key={m.id}>
                <label className="flex items-center gap-2 text-[13px]">
                  <Checkbox size="small" checked={Boolean(m.completedAt)} onChange={(e) => run(() => toggleMilestoneAction(m.id, e.target.checked))} sx={{ p: 0.5 }} />
                  <span className={STATE_STYLE[st]}>{m.title}</span>
                  {m.dueDate ? <span className={`text-xs ${st === "overdue" ? "font-medium text-danger" : "text-ink-muted"}`}>{st === "overdue" ? "overdue · " : ""}due {m.dueDate}</span> : null}
                  {m.completedAt ? <span className="text-xs text-success">done</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        {!history ? (
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); run(async () => { const r = await addMilestoneAction({ goalId: goal.id, title: String(fd.get("m") ?? ""), dueDate: String(fd.get("due") ?? "") || null }); if (r.ok) f.reset(); return r; }); }}>
            <TextField name="m" required placeholder="Add milestone…" slotProps={{ htmlInput: { maxLength: 200, "aria-label": "New milestone" } }} sx={{ flex: "1 1 160px" }} />
            <DateField name="due" aria-label="Milestone due date" sx={{ width: 160 }} />
            <Button type="submit" variant="outlined" disabled={pending} sx={{ height: 40 }}>Add</Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
