import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

const date = z.string().refine(isIsoDate, "Invalid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
const priority = z.enum(["low", "medium", "high", "urgent"]);
const status = z.enum(["new", "pending", "done", "incomplete"]);

const timesOk = (v: { start?: string | null | undefined; end?: string | null | undefined }) => !v.end || (Boolean(v.start) && v.end > v.start!);
const timesMsg = { path: ["end"], message: "End must be after start." };

export const createSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(300),
    priority: priority.default("medium"),
    date,
    start: time.nullish(),
    end: time.nullish(),
  })
  .refine(timesOk, timesMsg);

export const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    priority,
    status,
    date,
    start: time.nullable(),
    end: time.nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update.")
  .refine((p) => !(p.start && p.end) || p.end > p.start, timesMsg);

export const idSchema = z.string().uuid();
export const idsSchema = z.array(z.string().uuid()).min(1).max(200);

export type CreateInput = z.input<typeof createSchema>;
export type Patch = z.infer<typeof patchSchema>;
