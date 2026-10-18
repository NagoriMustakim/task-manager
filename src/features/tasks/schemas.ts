import { z } from "zod";
import { isIsoDate, isValidTimeZone } from "@/lib/dates";
import { parseRule } from "@/lib/recurrence";

const date = z.string().refine(isIsoDate, "Invalid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
const uuid = z.string().uuid();

export const priorityEnum = z.enum(["none", "low", "medium", "high", "urgent"]);
export const statusEnum = z.enum(["new", "pending", "done", "incomplete"]);

const rrule = z.string().max(200).refine((v) => parseRule(v) !== null, "Invalid repeat rule.");

const timeRange = (v: { startTime?: string | null | undefined; endTime?: string | null | undefined }) =>
  !v.endTime || (v.startTime && v.endTime > v.startTime);
const timeRangeMsg = { path: ["endTime"], message: "End must be after start." };

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(500),
    notes: z.string().trim().max(10_000).nullish(),
    priority: priorityEnum.default("medium"),
    date,
    startTime: time.nullish(),
    endTime: time.nullish(),
    estimatedMinutes: z.number().int().min(1).max(60 * 24).nullish(),
    categoryId: uuid.nullish(),
    deadline: date.nullish(),
    rrule: rrule.nullish(),
    recurrenceUntil: date.nullish(),
  })
  .refine(timeRange, timeRangeMsg)
  .refine((v) => !v.recurrenceUntil || v.recurrenceUntil >= v.date, { path: ["recurrenceUntil"], message: "End date is before the start." });

/** Status and time-of-day only. Dates change through rescheduling, which keeps history. */
export const updateOccurrenceSchema = z.object({
  id: uuid,
  patch: z
    .object({ status: statusEnum, startTime: time.nullable(), endTime: time.nullable() })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nothing to update.")
    .refine((p) => !(p.startTime && p.endTime) || p.endTime > p.startTime, "End must be after start."),
});

export const bulkStatusSchema = z.object({
  ids: z.array(uuid).min(1).max(200),
  status: z.enum(["new", "pending", "incomplete", "done"]),
});

export const rescheduleSchema = z
  .object({
    ids: z.array(uuid).min(1).max(200),
    date,
    keepTime: z.boolean().default(true),
    startTime: time.nullish(),
    endTime: time.nullish(),
    reason: z.string().trim().max(280).nullish(),
  })
  .refine((v) => v.keepTime || timeRange(v), timeRangeMsg);

export const updateTaskSchema = z.object({
  taskId: uuid,
  patch: z
    .object({
      title: z.string().trim().min(1).max(500),
      notes: z.string().trim().max(10_000).nullable(),
      priority: priorityEnum,
      estimatedMinutes: z.number().int().min(1).max(60 * 24).nullable(),
      categoryId: uuid.nullable(),
      goalId: uuid.nullable(),
      deadline: date.nullable(),
      archived: z.boolean(),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nothing to update."),
});

export const createCategorySchema = z.object({ name: z.string().trim().min(1).max(60) });
export const timezoneSchema = z.object({ timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone.") });

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type OccurrencePatch = z.infer<typeof updateOccurrenceSchema>["patch"];
export type TaskPatch = z.infer<typeof updateTaskSchema>["patch"];
export type RescheduleInput = z.input<typeof rescheduleSchema>;
