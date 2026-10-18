import { describe, expect, it } from "vitest";
import { bucketOf, isReschedulable, isUnfinished, rangeMetrics, summariseDay } from "./metrics";
import type { TaskItem } from "./types";

let n = 0;
const item = (o: Partial<TaskItem> = {}): TaskItem => ({
  id: `o${++n}`, taskId: "t1", title: "x", notes: null, priority: "medium", status: "new",
  scheduledDate: "2026-10-18", originalDate: "2026-10-18", startTime: null, endTime: null,
  estimatedMinutes: null, deadlineDate: null, categoryId: null, goalId: null, completedAt: null, completedOn: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", trackedSeconds: 0, taskTrackedSeconds: 0,
  createdDate: "2026-10-18", movedToId: null, movedToDate: null, movedReason: null, movedAt: null, recurrenceRule: null,
  ...o,
});

describe("bucketOf", () => {
  it("classifies completion against the planned date, using the stored completion date", () => {
    expect(bucketOf(item({ status: "done", completedOn: "2026-10-18" }))).toBe("done_on_time");
    expect(bucketOf(item({ status: "done", completedOn: "2026-10-17" }))).toBe("done_on_time");
    expect(bucketOf(item({ status: "done", completedOn: "2026-10-20" }))).toBe("done_late");
  });
  it("moved wins over the preserved status", () => expect(bucketOf(item({ status: "pending", movedToId: "x" }))).toBe("moved"));
  it("new and pending are both still pending", () => {
    expect(bucketOf(item({ status: "new" }))).toBe("pending");
    expect(bucketOf(item({ status: "pending" }))).toBe("pending");
    expect(bucketOf(item({ status: "incomplete" }))).toBe("incomplete");
  });
});

describe("eligibility", () => {
  it("only open, unmoved items are unfinished; done and moved cannot be rescheduled", () => {
    expect(isUnfinished(item({ status: "pending" }))).toBe(true);
    expect(isUnfinished(item({ status: "incomplete" }))).toBe(false);
    expect(isReschedulable(item({ status: "incomplete" }))).toBe(true);
    expect(isReschedulable(item({ status: "done" }))).toBe(false);
    expect(isReschedulable(item({ status: "new", movedToId: "x" }))).toBe(false);
  });
});

describe("summariseDay", () => {
  it("counts occurrences and unique tasks separately", () => {
    const s = summariseDay([item({ taskId: "a" }), item({ taskId: "a" }), item({ taskId: "b" })]);
    expect(s.occurrences).toBe(3);
    expect(s.uniqueTasks).toBe(2);
  });
  it("excludes moved items from the completion denominator", () => {
    const s = summariseDay([
      item({ status: "done", completedOn: "2026-10-18" }),
      item({ status: "pending", movedToId: "x" }),
      item({ status: "new" }),
    ]);
    expect(s.moved).toBe(1);
    expect(s.completionRate).toBe(50);
  });
  it("counts tasks created earlier but scheduled today, excluding carried ones", () => {
    const s = summariseDay([
      item({ createdDate: "2026-10-10" }),
      item({ createdDate: "2026-10-10", originalDate: "2026-10-12" }),
      item({ createdDate: "2026-10-18" }),
    ]);
    expect(s.plannedEarlier).toBe(1);
  });
});

describe("rangeMetrics: a rescheduled task is not counted as several completions", () => {
  const chain = [
    item({ id: "a", taskId: "t", originalDate: "2026-10-16", scheduledDate: "2026-10-16", status: "pending", movedToId: "b" }),
    item({ id: "b", taskId: "t", originalDate: "2026-10-16", scheduledDate: "2026-10-17", status: "pending", movedToId: "c" }),
    item({ id: "c", taskId: "t", originalDate: "2026-10-16", scheduledDate: "2026-10-18", status: "done", completedOn: "2026-10-18" }),
  ];
  it("has 3 occurrences but 1 completed instance and 1 unique task", () => {
    const m = rangeMetrics(chain);
    expect(m.occurrencesScheduled).toBe(3);
    expect(m.occurrencesCompleted).toBe(1);
    expect(m.instancesCompleted).toBe(1);
    expect(m.uniqueTasksCompleted).toBe(1);
  });
  it("a recurring task completed on 2 days is 2 instances but 1 unique task", () => {
    const m = rangeMetrics([
      item({ taskId: "r", originalDate: "2026-10-17", status: "done", completedOn: "2026-10-17" }),
      item({ taskId: "r", originalDate: "2026-10-18", status: "done", completedOn: "2026-10-18" }),
    ]);
    expect(m.instancesCompleted).toBe(2);
    expect(m.uniqueTasksCompleted).toBe(1);
  });
});
