import { describe, expect, it } from "vitest";
import { periodRange, periodStart } from "./period";

describe("goal periods", () => {
  it("snaps to week and month starts", () => {
    expect(periodStart("weekly", "2026-10-21", 1)).toBe("2026-10-19");
    expect(periodStart("weekly", "2026-10-25", 1)).toBe("2026-10-19");
    expect(periodStart("weekly", "2026-10-25", 0)).toBe("2026-10-25");
    expect(periodStart("monthly", "2026-10-21", 1)).toBe("2026-10-01");
  });
  it("derives inclusive ranges", () => {
    expect(periodRange("weekly", "2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodRange("monthly", "2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

import { goalIsPast, milestoneState } from "./period";

describe("milestones", () => {
  it("classifies done, overdue, upcoming and undated", () => {
    expect(milestoneState({ dueDate: "2026-10-01", completedAt: "2026-10-02T00:00:00Z" }, "2026-10-21")).toBe("done");
    expect(milestoneState({ dueDate: "2026-10-20", completedAt: null }, "2026-10-21")).toBe("overdue");
    expect(milestoneState({ dueDate: "2026-10-21", completedAt: null }, "2026-10-21")).toBe("upcoming");
    expect(milestoneState({ dueDate: null, completedAt: null }, "2026-10-21")).toBe("undated");
  });
});

describe("goal history", () => {
  const g = (o: Partial<Parameters<typeof goalIsPast>[0]>) => ({ status: "active" as const, period: "weekly" as const, periodStart: "2026-10-19", ...o });
  it("a goal moves to history when completed, archived or its period has ended", () => {
    expect(goalIsPast(g({}), "2026-10-25")).toBe(false); // last day of the week
    expect(goalIsPast(g({}), "2026-10-26")).toBe(true);
    expect(goalIsPast(g({ status: "completed" }), "2026-10-21")).toBe(true);
    expect(goalIsPast(g({ status: "archived" }), "2026-10-21")).toBe(true);
    expect(goalIsPast(g({ period: "monthly", periodStart: "2026-10-01" }), "2026-10-31")).toBe(false);
    expect(goalIsPast(g({ period: null, periodStart: null }), "2030-01-01")).toBe(false);
  });
});
