import { describe, expect, it } from "vitest";
import { createSchema, patchSchema } from "./schemas";
import { compareTodos, type Todo } from "./types";

let n = 0;
const t = (o: Partial<Todo>): Todo => ({ id: `t${++n}`, title: "x", priority: "medium", status: "new", date: "2026-10-21", start: null, end: null, createdAt: `2026-10-01T00:00:0${n % 10}Z`, ...o });

describe("ordering: priority first, then time", () => {
  it("urgent before high before medium before low; timed before untimed within a priority", () => {
    const list = [t({ priority: "low" }), t({ priority: "high", start: "15:00" }), t({ priority: "urgent" }), t({ priority: "high", start: "09:00" }), t({ priority: "high" }), t({ priority: "medium" })];
    expect([...list].sort(compareTodos).map((x) => `${x.priority}${x.start ? "@" + x.start : ""}`)).toEqual(["urgent", "high@09:00", "high@15:00", "high", "medium", "low"]);
  });
  it("days come first", () => expect([t({ date: "2026-10-22", priority: "urgent" }), t({ date: "2026-10-21", priority: "low" })].sort(compareTodos)[0]!.date).toBe("2026-10-21"));
});

describe("input validation", () => {
  const ok = { title: "Write report", date: "2026-10-21" };
  it("requires only a title and a day; defaults to medium priority", () => {
    const r = createSchema.parse(ok);
    expect(r.priority).toBe("medium");
  });
  it.each([
    [{ ...ok, title: "   " }], [{ ...ok, title: "x".repeat(301) }], [{ ...ok, date: "2026-02-30" }], [{ ...ok, start: "25:00" }],
    [{ ...ok, end: "10:00" }], [{ ...ok, start: "10:00", end: "09:00" }], [{ ...ok, priority: "none" }],
  ])("rejects %j", (input) => expect(createSchema.safeParse(input).success).toBe(false));
  it("accepts a valid time range", () => expect(createSchema.safeParse({ ...ok, start: "09:00", end: "10:30" }).success).toBe(true));
  it("patches must change something and keep times consistent; unknown fields are dropped", () => {
    expect(patchSchema.safeParse({}).success).toBe(false);
    expect(patchSchema.safeParse({ start: "10:00", end: "09:00" }).success).toBe(false);
    expect(patchSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(patchSchema.safeParse({ start: null, end: null }).success).toBe(true);
    expect(patchSchema.parse({ status: "done", user_id: "someone-else" } as never)).toEqual({ status: "done" });
  });
});
