import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/time";
import { compareReports, computeReport, goalProgress, overloadedDays, repeatedlyPostponed, type AnalyticsInput, type OccFact } from "./compute";
import { granularityFor, previousRange, resolveRange } from "./ranges";

const TZ = "Asia/Kolkata";
const occ = (o: Partial<OccFact> & { id: string; taskId: string; scheduledDate: string }): OccFact => ({
  originalDate: o.scheduledDate, status: "new", completedOn: null, completedAt: null, moved: false,
  priority: "medium", categoryId: null, estimatedMinutes: null, ...o,
});
const week = { from: "2026-10-19", to: "2026-10-25" };
const base = (over: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  range: week, today: "2026-10-21", timeZone: TZ, scheduled: [], completed: [], tasksCreated: 0, events: [], sessions: [], ...over,
});

const o1 = occ({ id: "o1", taskId: "A", scheduledDate: "2026-10-19", status: "done", completedOn: "2026-10-19", completedAt: "2026-10-19T04:30:00Z", priority: "high", estimatedMinutes: 60 });
const o2 = occ({ id: "o2", taskId: "B", scheduledDate: "2026-10-19", status: "pending", moved: true });
const o3 = occ({ id: "o3", taskId: "B", originalDate: "2026-10-19", scheduledDate: "2026-10-20", status: "done", completedOn: "2026-10-21", completedAt: "2026-10-21T10:00:00Z" });
const o4 = occ({ id: "o4", taskId: "C", scheduledDate: "2026-10-20", status: "incomplete", priority: "low" });
const o5 = occ({ id: "o5", taskId: "D", scheduledDate: "2026-10-21", status: "new", priority: "urgent" });
const o6 = occ({ id: "o6", taskId: "E", scheduledDate: "2026-10-23", status: "new" });
const o7 = occ({ id: "o7", taskId: "F", scheduledDate: "2026-10-18", status: "done", completedOn: "2026-10-19", completedAt: "2026-10-19T05:00:00Z" });

const fixture = () => base({
  scheduled: [o1, o2, o3, o4, o5, o6],
  completed: [o1, o3, o7],
  tasksCreated: 4,
  events: [
    { taskId: "B", type: "rescheduled", createdAt: "2026-10-19T08:00:00Z" },
    { taskId: "X", type: "rescheduled", createdAt: "2026-10-19T09:00:00Z" },
    { taskId: "X", type: "reschedule_undone", createdAt: "2026-10-19T09:01:00Z" },
  ],
});

describe("summary metrics on a known fixture", () => {
  const s = computeReport(fixture()).summary;
  it("counts tasks and occurrences separately", () => {
    expect(s.uniqueTasksCreated).toBe(4);
    expect(s.scheduledOccurrences).toBe(6);
    expect(s.uniqueTasksScheduled).toBe(5); // B appears twice (moved + new occurrence)
  });
  it("status counts exclude moved occurrences", () => {
    expect([s.newCount, s.pendingCount, s.incompleteCount, s.movedCount]).toEqual([2, 0, 1, 1]);
  });
  it("completion rate uses due, non-moved occurrences (future work isn't a miss)", () => {
    expect(s.dueOccurrences).toBe(4);
    expect(s.completionRate).toBe(0.5);
    expect(s.onTimeRate).toBe(0.25);
    expect(s.lateCompleted).toBe(1);
  });
  it("distinguishes scheduled-in-period from completed-during-period", () => {
    expect(s.scheduledDone).toBe(2);
    expect(s.completedDuringOccurrences).toBe(3); // includes o7, scheduled the day before
    expect(s.completedDuringInstances).toBe(3);
    expect(s.completedDuringUniqueTasks).toBe(3);
  });
  it("a rescheduled task completes once", () => {
    const r = computeReport(base({ scheduled: [o2, o3], completed: [o3] })).summary;
    expect(r.completedDuringOccurrences).toBe(1);
    expect(r.completedDuringUniqueTasks).toBe(1);
    expect(r.uniqueTasksScheduled).toBe(1);
  });
  it("overdue is open, unmoved and before today", () => {
    const x = computeReport(base({ scheduled: [occ({ id: "x", taskId: "X", scheduledDate: "2026-10-20", status: "pending" }), o2, o5] })).summary;
    expect(x.overdue).toBe(1);
  });
  it("net carry-forward ignores undone moves; postponements per task", () => {
    expect(s.carriedForward).toBe(1);
    expect(s.uniqueTasksCarried).toBe(1);
    expect(s.postponementsPerTask).toBe(1);
  });
  it("average daily completion divides by elapsed days only", () => {
    expect(s.daysElapsed).toBe(3);
    expect(s.avgDailyCompletion).toBe(1);
  });
});

describe("empty periods never fabricate numbers", () => {
  const r = computeReport(base());
  it("rates are null, counts zero", () => {
    expect(r.summary.completionRate).toBeNull();
    expect(r.summary.onTimeRate).toBeNull();
    expect(r.summary.postponementsPerTask).toBeNull();
    expect(r.summary.scheduledOccurrences).toBe(0);
    expect(r.series.every((b) => b.rate === null && b.due === 0)).toBe(true);
  });
  it("a future-only period has no elapsed days and no daily average", () => {
    const f = computeReport(base({ range: { from: "2026-11-02", to: "2026-11-08" } }));
    expect(f.summary.daysElapsed).toBe(0);
    expect(f.summary.avgDailyCompletion).toBeNull();
  });
});

describe("historical accuracy", () => {
  const r = computeReport(fixture());
  const day = (d: string) => r.series.find((b) => b.key === d)!;
  it("a later move/completion does not change an earlier day's record", () => {
    expect(day("2026-10-19")).toMatchObject({ scheduled: 1, due: 1, done: 1, rate: 1 }); // o2 moved away, not counted
    expect(day("2026-10-20")).toMatchObject({ scheduled: 2, due: 2, done: 1, rate: 0.5 });
  });
  it("completion is credited to its completion day separately from its schedule day", () => {
    expect(day("2026-10-19").completedDuring).toBe(2); // o1, o7
    expect(day("2026-10-21").completedDuring).toBe(1); // o3
    expect(day("2026-10-20").completedDuring).toBe(0);
  });
});

describe("priority, weekday, estimates", () => {
  const r = computeReport(fixture());
  it("priority completion", () => {
    expect(r.priority.find((p) => p.priority === "high")).toMatchObject({ due: 1, done: 1, rate: 1 });
    expect(r.priority.find((p) => p.priority === "urgent")).toMatchObject({ due: 1, done: 0, rate: 0 });
    expect(r.priority.find((p) => p.priority === "none")!.rate).toBeNull();
  });
  it("weekday counts and averages", () => {
    expect(r.weekday[1]).toEqual({ weekday: 1, completed: 2, average: 2 });
    expect(r.weekday[3]).toEqual({ weekday: 3, completed: 1, average: 1 });
    expect(r.weekday[5]!.average).toBeNull(); // Friday hasn't happened yet
  });
  it("estimated vs actual time", () => {
    const s = (a: string, b: string) => ({ taskId: "A", occurrenceId: "o1", categoryId: "c1", taskTitle: "A", estimatedMinutes: 60, startedAt: localToInstant(a.slice(0, 10), a.slice(11), TZ).toISOString(), endedAt: localToInstant(b.slice(0, 10), b.slice(11), TZ).toISOString() });
    const rep = computeReport({ ...fixture(), sessions: [s("2026-10-19T09:00", "2026-10-19T10:30"), s("2026-10-18T23:30", "2026-10-19T00:30")] });
    expect(rep.summary.estimatedSeconds).toBe(3600);
    expect(rep.summary.actualSeconds).toBe(90 * 60 + 30 * 60); // the Sunday half is outside the range
    expect(rep.categories).toEqual([{ categoryId: "c1", seconds: 7200 }]);
    expect(rep.series.find((b) => b.key === "2026-10-19")!.actualSeconds).toBe(7200);
  });
});

describe("timezone boundaries", () => {
  const ev = { taskId: "B", type: "rescheduled" as const, createdAt: "2026-10-18T20:00:00Z" }; // 01:30 on the 19th in Kolkata
  it("assigns an event to the user's local day", () => {
    expect(computeReport(base({ events: [ev] })).summary.carriedForward).toBe(1);
    expect(computeReport(base({ events: [ev], timeZone: "America/Los_Angeles" })).summary.carriedForward).toBe(0);
  });
  it("hourly completions use the user's timezone", () => {
    const r = computeReport(base({ range: { from: "2026-10-19", to: "2026-10-19" }, completed: [o1] }));
    expect(r.granularity).toBe("hour");
    expect(r.hourly[10]!.completed).toBe(1); // 04:30Z = 10:00 in Kolkata
  });
});

describe("granularity and range presets", () => {
  it("day -> hourly, month -> daily, year -> monthly", () => {
    expect(granularityFor({ from: "2026-10-19", to: "2026-10-19" })).toBe("hour");
    expect(granularityFor({ from: "2026-10-01", to: "2026-10-31" })).toBe("day");
    expect(granularityFor({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
  });
  it("yearly report has 12 monthly buckets", () => {
    const r = computeReport(base({ range: { from: "2026-01-01", to: "2026-12-31" }, today: "2026-12-31", scheduled: [occ({ id: "a", taskId: "A", scheduledDate: "2026-03-05", status: "done", completedOn: "2026-03-05" })] }));
    expect(r.series).toHaveLength(12);
    expect(r.series[2]).toMatchObject({ key: "2026-03", due: 1, done: 1, rate: 1 });
  });
  it("resolves presets around week and year boundaries", () => {
    expect(resolveRange("this_week", "2026-10-21", 1)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(resolveRange("last_week", "2026-10-21", 1)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(resolveRange("last_month", "2026-01-15", 1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveRange("last_year", "2026-06-01", 1)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolveRange("this_month", "2028-02-10", 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("validates custom ranges", () => {
    expect(resolveRange("custom", "2026-10-21", 1, { from: "2026-10-05", to: "2026-10-01" })).toBeNull();
    expect(resolveRange("custom", "2026-10-21", 1, { from: "nope", to: "2026-10-01" })).toBeNull();
    expect(resolveRange("custom", "2026-10-21", 1, { from: "2000-01-01", to: "2026-01-01" })).toBeNull(); // too long
    expect(resolveRange("custom", "2026-10-21", 1, { from: "2026-10-01", to: "2026-10-05" })).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });
  it("previous periods stay aligned", () => {
    expect(previousRange({ from: "2026-10-19", to: "2026-10-25" }, "this_week")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(previousRange({ from: "2026-03-01", to: "2026-03-31" }, "this_month")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("weekly review helpers", () => {
  it("flags overloaded days by planned time or count", () => {
    const heavy = occ({ id: "h", taskId: "H", scheduledDate: "2026-10-20", estimatedMinutes: 500 });
    const many = Array.from({ length: 10 }, (_, i) => occ({ id: `m${i}`, taskId: `M${i}`, scheduledDate: "2026-10-22" }));
    const r = computeReport(base({ scheduled: [heavy, ...many] }));
    expect(overloadedDays(r.series).map((b) => b.key)).toEqual(["2026-10-20", "2026-10-22"]);
  });
  it("finds repeatedly postponed tasks and week-over-week change", () => {
    const ev = (t: string, d: string) => ({ taskId: t, type: "rescheduled" as const, createdAt: `${d}T08:00:00Z` });
    const cur = computeReport(base({ events: [ev("B", "2026-10-19"), ev("B", "2026-10-20"), ev("C", "2026-10-20")], scheduled: [o1], completed: [o1] }));
    expect(repeatedlyPostponed(cur)).toEqual([{ taskId: "B", count: 2 }]);
    const prev = computeReport(base({ range: { from: "2026-10-12", to: "2026-10-18" }, scheduled: [occ({ id: "p", taskId: "P", scheduledDate: "2026-10-13", status: "incomplete" })] }));
    const c = compareReports(cur, prev);
    expect(c.completionRate).toEqual({ current: 1, previous: 0, change: 1 });
    expect(c.carriedForward.change).toBe(3);
  });
});

describe("goal progress never double counts rescheduled work", () => {
  const month = { from: "2026-10-01", to: "2026-10-31" };
  it("counts a chain as one instance", () => {
    expect(goalProgress([o2, o3], month, null)).toEqual({ instances: 1, completed: 1, target: null, percent: 100 });
  });
  it("respects the goal period by original date and a target count", () => {
    const outside = occ({ id: "z", taskId: "Z", scheduledDate: "2026-09-30", status: "done", completedOn: "2026-09-30" });
    expect(goalProgress([o1, o4, outside], month, null)).toMatchObject({ instances: 2, completed: 1, percent: 50 });
    expect(goalProgress([o1, o4], month, 4)).toMatchObject({ completed: 1, percent: 25 });
    expect(goalProgress([o1, o3, o7], month, 2)).toMatchObject({ percent: 100 }); // capped
  });
  it("is null with nothing linked", () => expect(goalProgress([], month, null).percent).toBeNull());
});
