import { describe, expect, it } from "vitest";
import { computeReport } from "@/features/analytics/compute";
import type { TaskItem } from "@/features/tasks/types";
import { buildMetricsDict, capacityByDay, fixedBlocks, pickTop, taskFact } from "./facts";
import { Aliaser } from "./payload";
import { cacheKey } from "./cache-key";
import { breakdownSchema, draftSchema, insightsSchema, planSchema, toApiSchema } from "./schemas";

let n = 0;
const item = (o: Partial<TaskItem> = {}): TaskItem => ({
  id: `real-uuid-${++n}`, taskId: `task-uuid-${n}`, title: "t", notes: "SECRET NOTES", priority: "medium", status: "new", scheduledDate: "2026-10-21", originalDate: "2026-10-21",
  startTime: null, endTime: null, estimatedMinutes: null, deadlineDate: null, categoryId: "cat-uuid", goalId: "goal-uuid", completedAt: null, completedOn: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "x", trackedSeconds: 0, taskTrackedSeconds: 0, createdDate: "2026-10-01", movedToId: null, movedToDate: null, movedReason: null, movedAt: null, recurrenceRule: null, ...o,
});

describe("data minimisation", () => {
  it("task facts carry no ids, notes, category/goal ids or timestamps", () => {
    const f = taskFact(item({ title: "Pay rent" }), new Aliaser(), new Map());
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/uuid|SECRET|cat-|goal-|createdAt|updatedAt|notes/);
    expect(f.ref).toBe("t1");
  });
  it("only sends the highest-priority tasks when over the cap", () => {
    const many = [item({ priority: "low" }), item({ priority: "urgent" }), item({ priority: "high", deadlineDate: "2026-10-22" }), item({ priority: "high", deadlineDate: "2026-10-30" })];
    expect(pickTop(many, 3).map((i) => i.priority)).toEqual(["urgent", "high", "high"]);
    expect(pickTop(many, 3)[1]!.deadlineDate).toBe("2026-10-22");
  });
});

describe("capacity and commitments", () => {
  it("computes fixed blocks (default 30 min) and free time per day", () => {
    expect(fixedBlocks([item({ startTime: "10:00", endTime: "11:00" }), item({ startTime: "14:00" }), item({})])).toEqual([{ start: "10:00", end: "11:00" }, { start: "14:00", end: "14:30" }]);
    const cap = capacityByDay([item({ scheduledDate: "2026-10-22", estimatedMinutes: 120 }), item({ scheduledDate: "2026-10-22", status: "done" })], "2026-10-21", 540, 2);
    expect(cap).toEqual([
      { daysFromToday: 0, date: "2026-10-21", committedMinutes: 0, freeMinutes: 540 },
      { daysFromToday: 1, date: "2026-10-22", committedMinutes: 120, freeMinutes: 420 },
      { daysFromToday: 2, date: "2026-10-23", committedMinutes: 0, freeMinutes: 540 },
    ]);
  });
});

describe("metrics dictionary comes only from server-computed reports", () => {
  const range = { from: "2026-10-19", to: "2026-10-25" };
  const occ = (id: string, status: "done" | "new") => ({ id, taskId: id, originalDate: "2026-10-19", scheduledDate: "2026-10-19", status, completedOn: status === "done" ? "2026-10-19" : null, completedAt: null, moved: false, priority: "medium" as const, categoryId: null, estimatedMinutes: 60 });
  const base = { today: "2026-10-21", timeZone: "Asia/Kolkata", completed: [], tasksCreated: 0, events: [], sessions: [] };
  const cur = computeReport({ ...base, range, scheduled: [occ("a", "done"), occ("b", "new")] });
  const prev = computeReport({ ...base, range: { from: "2026-10-12", to: "2026-10-18" }, scheduled: [] });
  it("mirrors report values exactly and marks missing comparisons as null", () => {
    const m = buildMetricsDict(cur, prev);
    expect(m.completionRatePct).toBe(50);
    expect(m.estimatedMinutes).toBe(120);
    expect(m.prev_completionRatePct).toBeNull();
    expect(m.change_completionRatePts).toBeNull();
    expect(Object.values(m).every((v) => v === null || Number.isFinite(v))).toBe(true);
  });
});

describe("schemas sent to the API", () => {
  it("are structure-only (no length/range keywords) but keep required + additionalProperties=false", () => {
    for (const s of [planSchema, draftSchema, insightsSchema, breakdownSchema]) {
      const json = JSON.stringify(toApiSchema(s));
      expect(json).not.toMatch(/maxLength|minLength|maxItems|minItems|"maximum"|"minimum"|"pattern"|\$schema/);
      expect(json).toMatch(/"additionalProperties":false/);
      expect(json).toMatch(/"required"/);
    }
  });
  it("Zod still enforces limits on the response", () => {
    expect(breakdownSchema.safeParse({ subtasks: [], note: null }).success).toBe(false);
    expect(breakdownSchema.safeParse({ subtasks: [{ title: "x".repeat(500), estimatedMinutes: null }], note: null }).success).toBe(false);
    expect(draftSchema.safeParse({ title: "t", date: null, startTime: "25:99", endTime: null, priority: null, durationMinutes: null, ambiguities: [], confidence: "high" }).success).toBe(false);
  });
});

describe("cacheKey", () => {
  const parts = { feature: "plan", model: "m1", subjectId: "u1", input: { b: 2, a: { y: 1, x: 2 } } };
  it("is stable across key order and differs by feature, model, subject and input", () => {
    const k = cacheKey(parts);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey({ ...parts, input: { a: { x: 2, y: 1 }, b: 2 } })).toBe(k);
    expect(cacheKey({ ...parts, model: "m2" })).not.toBe(k);
    expect(cacheKey({ ...parts, subjectId: "u2" })).not.toBe(k);
    expect(cacheKey({ ...parts, feature: "carry" })).not.toBe(k);
    expect(cacheKey({ ...parts, input: { a: 1 } })).not.toBe(k);
  });
});
