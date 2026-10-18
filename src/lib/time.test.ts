import { describe, expect, it } from "vitest";
import { formatClock, formatSeconds, instantToLocal, localToInstant, secondsBetween, splitByDay, startOfLocalDay } from "./time";

const sum = (p: { seconds: number }[]) => p.reduce((n, x) => n + x.seconds, 0);

describe("local <-> instant", () => {
  it("Asia/Kolkata is UTC+5:30 with no DST", () => {
    expect(localToInstant("2026-10-18", "00:00", "Asia/Kolkata").toISOString()).toBe("2026-10-17T18:30:00.000Z");
    expect(instantToLocal("2026-10-17T18:30:00Z", "Asia/Kolkata")).toEqual({ date: "2026-10-18", time: "00:00" });
  });
  it("round-trips across DST for New York", () => {
    for (const [d, t] of [["2026-01-15", "09:30"], ["2026-07-15", "09:30"], ["2026-03-09", "00:00"]] as const) {
      expect(instantToLocal(localToInstant(d, t, "America/New_York"), "America/New_York")).toEqual({ date: d, time: t });
    }
  });
  it("handles the spring-forward gap and fall-back overlap", () => {
    // 02:30 on 2026-03-08 does not exist in New York -> lands after the gap.
    expect(instantToLocal(localToInstant("2026-03-08", "02:30", "America/New_York"), "America/New_York").time).toBe("03:30");
    // 01:30 on 2026-11-01 happens twice -> first occurrence (EDT, UTC-4).
    expect(localToInstant("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("splitByDay (midnight crossing)", () => {
  it("splits a session across local midnight", () => {
    const start = localToInstant("2026-10-18", "23:30", "Asia/Kolkata");
    const end = localToInstant("2026-10-19", "00:45", "Asia/Kolkata");
    expect(splitByDay(start, end, "Asia/Kolkata")).toEqual([{ date: "2026-10-18", seconds: 1800 }, { date: "2026-10-19", seconds: 2700 }]);
  });
  it("the same instants fall on different days in another timezone", () => {
    const start = localToInstant("2026-10-18", "23:30", "Asia/Kolkata");
    const end = localToInstant("2026-10-19", "00:45", "Asia/Kolkata");
    expect(splitByDay(start, end, "America/Los_Angeles")).toEqual([{ date: "2026-10-18", seconds: 4500 }]);
  });
  it("spans multiple days, month and year ends, summing exactly", () => {
    const start = localToInstant("2026-12-31", "22:00", "Asia/Kolkata");
    const end = localToInstant("2027-01-02", "02:00", "Asia/Kolkata");
    const parts = splitByDay(start, end, "Asia/Kolkata");
    expect(parts.map((p) => p.date)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(sum(parts)).toBe(secondsBetween(start, end));
  });
  it("DST days are 23h / 25h long but totals stay exact", () => {
    const tz = "America/New_York";
    const s = startOfLocalDay("2026-03-08", tz), e = startOfLocalDay("2026-03-09", tz);
    expect(splitByDay(s, e, tz)).toEqual([{ date: "2026-03-08", seconds: 23 * 3600 }]);
    const s2 = startOfLocalDay("2026-11-01", tz), e2 = startOfLocalDay("2026-11-02", tz);
    expect(splitByDay(s2, e2, tz)).toEqual([{ date: "2026-11-01", seconds: 25 * 3600 }]);
    const a = localToInstant("2026-03-07", "23:00", tz), b = localToInstant("2026-03-08", "04:00", tz);
    expect(sum(splitByDay(a, b, tz))).toBe(secondsBetween(a, b));
  });
  it("returns nothing for empty or reversed sessions", () => {
    const t = new Date("2026-10-18T10:00:00Z");
    expect(splitByDay(t, t, "UTC")).toEqual([]);
    expect(splitByDay(new Date(t.getTime() + 1000), t, "UTC")).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats durations and clocks", () => {
    expect(formatSeconds(0)).toBe("0m");
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(3725)).toBe("1h 2m");
    expect(formatSeconds(7200)).toBe("2h");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
