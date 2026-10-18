import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/time";
import { aggregate, buildRanges, estimateReport, type ClosedSession } from "./stats";

const TZ = "Asia/Kolkata";
const s = (o: Partial<ClosedSession> & { from: [string, string]; to: [string, string] }): ClosedSession => ({
  taskId: "t1", occurrenceId: "o1", categoryId: null, taskTitle: "Task", estimatedMinutes: null,
  startedAt: localToInstant(o.from[0], o.from[1], TZ).toISOString(),
  endedAt: localToInstant(o.to[0], o.to[1], TZ).toISOString(),
  ...o,
});

describe("buildRanges", () => {
  it("Monday-start and Sunday-start weeks", () => {
    expect(buildRanges("2026-10-21", 1).week).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(buildRanges("2026-10-21", 0).week).toEqual({ from: "2026-10-18", to: "2026-10-24" });
    expect(buildRanges("2026-10-19", 1).week.from).toBe("2026-10-19");
  });
  it("month and year", () => {
    const r = buildRanges("2028-02-10", 1);
    expect(r.month).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(r.year).toEqual({ from: "2028-01-01", to: "2028-12-31" });
  });
});

describe("aggregate", () => {
  const ranges = buildRanges("2026-10-19", 1);
  it("counts today vs yesterday with a midnight-crossing session split correctly", () => {
    const r = aggregate([s({ from: ["2026-10-18", "23:00"], to: ["2026-10-19", "01:00"] })], TZ, ranges);
    expect(r.yesterday.totalSeconds).toBe(3600);
    expect(r.today.totalSeconds).toBe(3600);
    expect(r.week.totalSeconds).toBe(3600); // only Monday's half is in the Mon–Sun week
    expect(r.month.totalSeconds).toBe(7200);
  });
  it("a session across New Year splits between years", () => {
    const rr = buildRanges("2027-01-01", 1);
    const x = aggregate([s({ from: ["2026-12-31", "23:00"], to: ["2027-01-01", "02:00"] })], TZ, rr);
    expect(x.year.totalSeconds).toBe(2 * 3600);
    expect(x.today.totalSeconds).toBe(2 * 3600);
  });
  it("groups by task and category, and manual corrections are just different timestamps", () => {
    const r = aggregate([
      s({ taskId: "a", taskTitle: "A", categoryId: "c1", from: ["2026-10-19", "09:00"], to: ["2026-10-19", "10:00"] }),
      s({ taskId: "a", taskTitle: "A", categoryId: "c1", from: ["2026-10-19", "11:00"], to: ["2026-10-19", "11:30"] }),
      s({ taskId: "b", taskTitle: "B", from: ["2026-10-19", "12:00"], to: ["2026-10-19", "12:15"] }),
    ], TZ, ranges);
    expect(r.today.byTask.get("a")).toEqual({ title: "A", seconds: 5400 });
    expect(r.today.byCategory.get("c1")).toBe(5400);
    expect(r.today.byCategory.get("")).toBe(900);
  });
  it("ignores sessions outside every range", () => {
    expect(aggregate([s({ from: ["2025-01-01", "09:00"], to: ["2025-01-01", "10:00"] })], TZ, ranges).year.totalSeconds).toBe(0);
  });
});

describe("estimateReport", () => {
  const occ = (n: number, minutes: number) =>
    s({ taskId: "r", taskTitle: "Report", occurrenceId: `o${n}`, estimatedMinutes: 30, from: [`2026-10-0${n}`, "09:00"], to: [`2026-10-0${n}`, `${9 + Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`.replace(/^(\d):/, "0$1:")] });
  it("flags a task that exceeds its estimate on most occurrences", () => {
    const [row] = estimateReport([occ(1, 45), occ(2, 50), occ(3, 20), occ(4, 40)]);
    expect(row).toMatchObject({ trackedOccurrences: 4, overOccurrences: 3, consistentlyOver: true });
  });
  it("needs enough history before calling it consistent", () => {
    expect(estimateReport([occ(1, 45), occ(2, 50)])[0]!.consistentlyOver).toBe(false);
  });
  it("is not consistent when overruns are the exception", () => {
    expect(estimateReport([occ(1, 20), occ(2, 25), occ(3, 20), occ(4, 45)])[0]!.consistentlyOver).toBe(false);
  });
  it("skips tasks without an estimate and separates estimated from recorded", () => {
    expect(estimateReport([s({ from: ["2026-10-01", "09:00"], to: ["2026-10-01", "10:00"] })])).toEqual([]);
    const r = estimateReport([occ(1, 45)])[0]!;
    expect(r.estimateSeconds).toBe(1800);
    expect(r.actualSeconds).toBe(2700);
    expect(r.varianceSeconds).toBe(900);
  });
});
