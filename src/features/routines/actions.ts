"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserSettings } from "@/features/tasks/queries";
import { isIsoDate } from "@/lib/dates";
import { parseRule } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const schema = z.object({
  taskId: z.string().uuid(),
  rule: z.string().max(200).refine((v) => parseRule(v) !== null, "Invalid repeat rule."),
  from: z.string().refine(isIsoDate, "Invalid date."),
  until: z.string().refine(isIsoDate, "Invalid end date.").nullish(),
  startTime: time.nullish(),
  endTime: time.nullish(),
});

/** Changes how a routine repeats from `from` onward. Past occurrences are never touched. */
export async function updateRecurrenceAction(input: z.input<typeof schema>): Promise<Result<{ removed: number }>> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input." };
  const v = p.data;
  if (v.until && v.until < v.from) return { ok: false, error: "The end date is before the start." };
  if (v.endTime && (!v.startTime || v.endTime <= v.startTime)) return { ok: false, error: "End must be after start." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your session has ended. Sign in again." };
  const { today } = await getUserSettings(auth.user.id);
  if (v.from < today) return { ok: false, error: "The change must start today or later; past entries keep their history." };

  const { data, error } = await supabase.rpc("update_recurrence", {
    p_task_id: v.taskId, p_rule: v.rule, p_from: v.from, p_until: v.until ?? null, p_start: v.startTime ?? null, p_end: v.endTime ?? null,
  });
  if (error) return { ok: false, error: error.code === "22023" ? "Check the repeat settings." : error.code === "P0002" ? "That routine no longer exists." : "Something went wrong. Try again." };
  revalidatePath("/routines");
  return { ok: true, data: { removed: data ?? 0 } };
}
