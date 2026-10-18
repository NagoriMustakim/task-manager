import { describe, expect, it } from "vitest";
import type { TaskItem } from "@/features/tasks/types";
import { highPriorityUnfinished, isUnderestimated, recommendCarryForward } from "./review";

let n = 0;
const it_ = (o: Partial<TaskItem>): TaskItem => ({
  id: `i${++n}`, taskId: `t${n}`, title: "t", notes: null, priority: "medium", status: "new", scheduledDate: "2026-10-21", originalDate: "2026-10-21",
  startTime: null, endTime: null, estimatedMinutes: null, deadlineDate: null, categoryId: null, goalId: null, completedAt: null, completedOn: null,
  createdAt: "", updatedAt: "", trackedSeconds: 0, taskTrackedSeconds: 0, createdDate: "2026-10-01", movedToId: null, movedToDate: null, movedReason: null, movedAt: null, recurrenceRule: null, ...o,
});

describe("recommendCarryForward", () => {
  const asOf = "2026-10-21";
  const rec = recommendCarryForward([
    it_({ id: "hi", priority: "urgent" }),
    it_({ id: "dl", deadlineDate: "2026-10-23" }),
    it_({ id: "late", deadlineDate: "2026-10-19" }),
    it_({ id: "wip", status: "pending" }),
    it_({ id: "meh", priority: "low" }),
    it_({ id: "done", status: "done" }),
    it_({ id: "inc", status: "incomplete" }),
    it_({ id: "mv", status: "pending", movedToId: "x" }),
    it_({ id: "far", deadlineDate: "2026-10-24" }),
  ], asOf);
  const by = (id: string) => rec.find((r) => r.item.id === id);
  it("recommends high priority, near deadlines and in-progress work with reasons", () => {
    expect(by("hi")).toMatchObject({ recommended: true, reasons: ["urgent priority"] });
    expect(by("dl")!.reasons).toEqual(["deadline soon"]);
    expect(by("late")!.reasons).toEqual(["deadline passed"]);
    expect(by("wip")!.reasons).toEqual(["in progress"]);
  });
  it("does not pre-select low-value or far-deadline work", () => {
    expect(by("meh")!.recommended).toBe(false);
    expect(by("far")!.recommended).toBe(false);
  });
  it("only considers open, unmoved tasks and lists recommended first", () => {
    expect(by("done")).toBeUndefined();
    expect(by("inc")).toBeUndefined();
    expect(by("mv")).toBeUndefined();
    expect(rec.findIndex((r) => !r.recommended)).toBeGreaterThan(rec.findLastIndex((r) => r.recommended));
  });
});

describe("helpers", () => {
  it("finds unfinished high-priority work", () => {
    const l = highPriorityUnfinished([it_({ priority: "high" }), it_({ priority: "urgent", status: "done" }), it_({ priority: "low" })]);
    expect(l).toHaveLength(1);
  });
  it("underestimated at 125% of estimate", () => {
    expect(isUnderestimated({ estimateSeconds: 3600, actualSeconds: 4500, trackedOccurrences: 1 })).toBe(true);
    expect(isUnderestimated({ estimateSeconds: 3600, actualSeconds: 4499, trackedOccurrences: 1 })).toBe(false);
    expect(isUnderestimated({ estimateSeconds: 3600, actualSeconds: 8000, trackedOccurrences: 2 })).toBe(false);
  });
});
