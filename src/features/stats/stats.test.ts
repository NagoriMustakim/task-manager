import { describe, expect, it } from "vitest";
import type { Todo } from "@/features/todos/types";
import { computeStats } from "./compute";
import { resolveRange } from "./ranges";

let n = 0;
const t = (o: Partial<Todo>): Todo => ({ id: `t${++n}`, title: "x", priority: "medium", status: "new", date: "2026-10-20", start: null, end: null, createdAt: "2026-10-01T00:00:00Z", ...o });
const TODAY = "2026-10-21";

describe("computeStats", () => {
  const todos = [
    t({ status: "done", priority: "urgent" }), t({ status: "done", date: "2026-10-19" }), t({ status: "incomplete", priority: "low" }),
    t({ status: "pending", date: "2026-10-21", priority: "high" }), t({ status: "new", date: "2026-10-23" }), t({ status: "new", date: "2026-10-18", priority: "none" }),
  ];
  const s = computeStats(todos, TODAY);
  it("counts statuses", () => expect([s.total, s.fresh, s.pending, s.incomplete]).toEqual([6, 2, 1, 1]));
  it("rate is done ÷ due, ignoring future-dated tasks", () => {
    expect(s.due).toBe(5);
    expect(s.done).toBe(2);
    expect(s.rate).toBeCloseTo(0.4);
  });
  it("overdue = open and before today", () => expect(s.overdue).toBe(1)); // the 18th; the pending one is today
  it("priority breakdown (none counts as medium)", () => {
    expect(s.byPriority.find((p) => p.priority === "urgent")).toEqual({ priority: "urgent", total: 1, done: 1 });
    expect(s.byPriority.find((p) => p.priority === "medium")!.total).toBe(3);
  });
  it("per-day rows are sorted", () => {
    expect(s.byDay.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23"]);
    expect(s.byDay.find((d) => d.date === "2026-10-20")).toEqual({ date: "2026-10-20", total: 2, done: 1, open: 0 });
  });
  it("empty input gives a null rate, not 0%", () => {
    const e = computeStats([], TODAY);
    expect([e.total, e.rate, e.byDay.length]).toEqual([0, null, 0]);
  });
});

describe("resolveRange", () => {
  it("weeks run Monday to Sunday", () => {
    expect(resolveRange("this_week", "2026-10-21")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(resolveRange("this_week", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(resolveRange("last_week", "2026-10-21")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
  it("months incl. year change and leap February", () => {
    expect(resolveRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveRange("this_month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("today and yesterday", () => {
    expect(resolveRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange("yesterday", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });
  it("validates custom ranges", () => {
    expect(resolveRange("custom", TODAY, { from: "2026-10-01", to: "2026-10-05" })).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(resolveRange("custom", TODAY, { from: "2026-10-05", to: "2026-10-01" })).toBeNull();
    expect(resolveRange("custom", TODAY, { from: "x", to: "2026-10-01" })).toBeNull();
    expect(resolveRange("custom", TODAY, { from: "2024-01-01", to: "2026-01-01" })).toBeNull();
  });
});
