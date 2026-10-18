"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/features/tasks/queries";
import { createGoalSchema, milestoneSchema, type CreateGoalInput } from "./schemas";
import { periodStart } from "./period";

type Result = { ok: true } | { ok: false; error: string };
const GENERIC = "Something went wrong. Try again.";

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

export async function createGoalAction(input: CreateGoalInput): Promise<Result> {
  const p = createGoalSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input." };
  const supabase = await authed();
  if (!supabase) return { ok: false, error: "Your session has ended. Sign in again." };
  const { today, weekStartDay } = await getUserSettings();
  const v = p.data;
  const { error } = await supabase.from("goals").insert({
    title: v.title, description: v.description ?? null,
    period: v.period, period_start: v.period ? periodStart(v.period, v.anchorDate ?? today, weekStartDay) : null,
    target_count: v.targetCount ?? null,
  });
  if (error) return { ok: false, error: GENERIC };
  revalidatePath("/goals");
  return { ok: true };
}

export async function setGoalStatusAction(goalId: string, status: "active" | "completed" | "archived"): Promise<Result> {
  const supabase = await authed();
  if (!supabase) return { ok: false, error: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("goals").update({ status }).eq("id", goalId).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: GENERIC };
  revalidatePath("/goals");
  return { ok: true };
}

export async function addMilestoneAction(input: { goalId: string; title: string; dueDate?: string | null }): Promise<Result> {
  const p = milestoneSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a milestone title." };
  const supabase = await authed();
  if (!supabase) return { ok: false, error: "Your session has ended. Sign in again." };
  const { error } = await supabase.from("milestones").insert({ goal_id: p.data.goalId, title: p.data.title, due_date: p.data.dueDate ?? null });
  if (error) return { ok: false, error: GENERIC };
  revalidatePath("/goals");
  return { ok: true };
}

export async function toggleMilestoneAction(id: string, done: boolean): Promise<Result> {
  const supabase = await authed();
  if (!supabase) return { ok: false, error: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("milestones").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: GENERIC };
  revalidatePath("/goals");
  return { ok: true };
}

export async function linkTaskToGoalAction(taskId: string, goalId: string | null): Promise<Result> {
  const supabase = await authed();
  if (!supabase) return { ok: false, error: "Your session has ended. Sign in again." };
  const { data, error } = await supabase.from("tasks").update({ goal_id: goalId }).eq("id", taskId).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: GENERIC };
  revalidatePath("/goals");
  return { ok: true };
}
