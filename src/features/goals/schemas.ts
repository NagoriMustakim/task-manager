import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const createGoalSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  description: z.string().trim().max(2000).nullish(),
  period: z.enum(["weekly", "monthly"]).nullable(),
  /** Any date inside the wanted period; the server snaps it to the week/month start. */
  anchorDate: z.string().refine(isIsoDate, "Invalid date.").nullish(),
  targetCount: z.number().int().min(1).max(10000).nullish(),
});
export const milestoneSchema = z.object({ goalId: z.string().uuid(), title: z.string().trim().min(1).max(200), dueDate: z.string().refine(isIsoDate).nullish() });
export type CreateGoalInput = z.input<typeof createGoalSchema>;
