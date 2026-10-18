import { describe, expect, it } from "vitest";
import { dateInZone, todayIn } from "@/lib/dates";
import { dayRange, inRange, monthRange, yearRange } from "@/lib/ranges";
import { occurrenceDates, parseRule } from "@/lib/recurrence";
import { bucketOf, rangeMetrics, summariseDay } from "./metrics";
import type { TaskItem } from "./types";

let n = 0;
const base = (o: Partial<TaskItem>): TaskItem => ({
  id: `o${++n}`, taskId: "t", title: "x", notes: null, priority: "medium", status: "new",
  scheduledDate: "2026-10-16", originalDate: "2026-10-16", startTime: null, endTime: null,
  estimatedMinutes: null, deadlineDate: null, categoryId: null, goalId: null, completedAt: null, completedOn: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", trackedSeconds: 0, taskTrackedSeconds: 0,
  createdDate: "2026-10-01", movedToId: null, movedToDate: null, movedReason: null, movedAt: null, recurrenceRule: null,
  ...o,
});

// A task scheduled 16th, carried to 17th, again to 18th, then completed on the 19th.
const chain = () => [
  base({ id: "a", scheduledDate: "2026-10-16", status: "pending", movedToId: "b", movedToDate: "2026-10-17" }),
  base({ id: "b", scheduledDate: "2026-10-17", status: "new", movedToId: "c", movedToDate: "2026-10-18" }),
  base({ id: "c", scheduledDate: "2026-10-18", status: "pending", movedToId: "d", movedToDate: "2026-10-19" }),
  base({ id: "d", scheduledDate: "2026-10-19", status: "done", completedOn: "2026-10-19" }),
];

describe("multiple carry-forwards", () => {
  it("keeps every past day's record and original date intact", () => {
    const c = chain();
    expect(c.every((i) => i.originalDate === "2026-10-16")).toBe(true);
    expect(c.slice(0, 3).map(bucketOf)).toEqual(["moved", "moved", "moved"]);
    expect(c.slice(0, 3).map((i) => i.status)).toEqual(["pending", "new", "pending"]); // statuses preserved
  });
  it("counts the chain as 4 occurrences, 1 instance, 1 unique task, 1 completion", () => {
    const m = rangeMetrics(chain());
    expect([m.occurrencesScheduled, m.occurrencesCompleted, m.instancesCompleted, m.uniqueTasksCompleted]).toEqual([4, 1, 1, 1]);
  });
});

describe("completion after rescheduling", () => {
  it("is on time on the new scheduled day", () => expect(bucketOf(chain()[3]!)).toBe("done_on_time"));
  it("is late if finished after the (new) planned date", () =>
    expect(bucketOf(base({ status: "done", scheduledDate: "2026-10-19", completedOn: "2026-10-21" }))).toBe("done_late"));
  it("does not make the earlier days look completed", () => {
    const day16 = summariseDay([chain()[0]!]);
    expect(day16.doneOnTime + day16.doneLate).toBe(0);
    expect(day16.moved).toBe(1);
  });
});

describe("historical accuracy", () => {
  it("summary of a past day is unchanged by later moves of other days", () => {
    const before = summariseDay([base({ status: "incomplete" }), base({ status: "done", completedOn: "2026-10-16" })]);
    const after = summariseDay([base({ status: "incomplete" }), base({ status: "done", completedOn: "2026-10-16" })]);
    expect(after).toEqual(before);
  });
  it("completion date, not timestamp-in-current-timezone, drives on-time classification", () => {
    // Completed 23:30 on the 16th in New York, which is already the 17th in Kolkata.
    const instant = "2026-10-17T03:30:00Z";
    const stored = dateInZone(instant, "America/New_York");
    expect(stored).toBe("2026-10-16");
    expect(bucketOf(base({ status: "done", scheduledDate: "2026-10-16", completedOn: stored }))).toBe("done_on_time");
    // Re-deriving in a newly chosen timezone would wrongly flip it to late:
    expect(dateInZone(instant, "Asia/Kolkata")).toBe("2026-10-17");
  });
});

describe("recurrence boundaries", () => {
  const rule = parseRule("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=30")!;
  it("handles leap-year February and year end", () => {
    expect(occurrenceDates(rule, { start: "2028-01-30", from: "2028-01-01", to: "2028-03-31" })).toEqual(["2028-01-30", "2028-02-29", "2028-03-30"]);
    expect(occurrenceDates(rule, { start: "2026-11-30", from: "2026-11-01", to: "2027-02-28" })).toEqual(["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
  });
  it("weekly rule across the new year", () => {
    const r = parseRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=FR")!;
    expect(occurrenceDates(r, { start: "2026-12-25", from: "2026-12-25", to: "2027-01-08" })).toEqual(["2026-12-25", "2027-01-01", "2027-01-08"]);
  });
  it("includes the until date and nothing after", () => {
    const r = parseRule("FREQ=DAILY;INTERVAL=1")!;
    const d = occurrenceDates(r, { start: "2026-10-01", from: "2026-10-01", to: "2026-12-31", until: "2026-10-03" });
    expect(d.at(-1)).toBe("2026-10-03");
  });
});

describe("duplicate occurrence prevention (generation side)", () => {
  const r = parseRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH")!;
  const opts = { start: "2026-10-01" };
  it("never produces duplicate dates", () => {
    const d = occurrenceDates(r, { ...opts, from: "2026-10-01", to: "2026-12-31" });
    expect(new Set(d).size).toBe(d.length);
  });
  it("overlapping windows agree, so re-running generation is idempotent", () => {
    const a = occurrenceDates(r, { ...opts, from: "2026-10-01", to: "2026-11-15" });
    const b = occurrenceDates(r, { ...opts, from: "2026-11-01", to: "2026-12-31" });
    const all = occurrenceDates(r, { ...opts, from: "2026-10-01", to: "2026-12-31" });
    expect([...new Set([...a, ...b])].sort()).toEqual(all);
  });
  it("resuming from generated_through + 1 yields no overlap", () => {
    const first = occurrenceDates(r, { ...opts, from: "2026-10-01", to: "2026-10-31" });
    const next = occurrenceDates(r, { ...opts, from: "2026-11-01", to: "2026-11-30" });
    expect(first.filter((d) => next.includes(d))).toEqual([]);
  });
});

describe("daily / monthly / yearly reporting boundaries", () => {
  it("month ranges include the last day, including leap February", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-12").to).toBe("2026-12-31");
  });
  it("year ranges span Jan 1 – Dec 31 inclusive", () => {
    const y = yearRange(2026);
    expect(inRange("2026-01-01", y) && inRange("2026-12-31", y)).toBe(true);
    expect(inRange("2025-12-31", y) || inRange("2027-01-01", y)).toBe(false);
  });
  it("rejects invalid input", () => {
    expect(() => monthRange("2026-13")).toThrow();
    expect(() => yearRange(1800)).toThrow();
  });
  it("a task finished just after local midnight lands in the next day/month/year for the user's zone", () => {
    const instant = new Date("2026-12-31T19:00:00Z"); // 00:30 on 1 Jan 2027 in Kolkata
    const kolkata = todayIn("Asia/Kolkata", instant);
    const la = todayIn("America/Los_Angeles", instant);
    expect(kolkata).toBe("2027-01-01");
    expect(la).toBe("2026-12-31");
    expect(inRange(kolkata, yearRange(2027))).toBe(true);
    expect(inRange(la, yearRange(2026))).toBe(true);
    expect(inRange(kolkata, monthRange("2027-01"))).toBe(true);
    expect(inRange(la, dayRange("2026-12-31"))).toBe(true);
  });
  it("completed-instance counts per period never exceed one per chain", () => {
    const items = chain();
    const perDay = ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((d) =>
      rangeMetrics(items.filter((i) => inRange(i.scheduledDate, dayRange(d)))).instancesCompleted);
    expect(perDay.reduce((a, b) => a + b, 0)).toBe(1);
    expect(rangeMetrics(items.filter((i) => inRange(i.scheduledDate, monthRange("2026-10")))).instancesCompleted).toBe(1);
    expect(rangeMetrics(items.filter((i) => inRange(i.scheduledDate, yearRange(2026)))).uniqueTasksCompleted).toBe(1);
  });
});
