import { describe, expect, it } from "vitest";
import { describeRule, occurrenceDates, parseRule, presetRule, serializeRule } from "./recurrence";

const dates = (rule: string, start: string, from: string, to: string, until?: string) =>
  occurrenceDates(parseRule(rule)!, { start, from, to, until: until ?? null });

describe("rule parsing", () => {
  it("round-trips", () => {
    for (const r of ["FREQ=DAILY;INTERVAL=1", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31"]) {
      expect(serializeRule(parseRule(r)!)).toBe(r);
    }
  });
  it.each(["", "FREQ=YEARLY", "FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;INTERVAL=abc", "FREQ=WEEKLY;BYDAY=XX", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=DAILY;COUNT=5"])("rejects %j", (r) => expect(parseRule(r)).toBeNull());
});

describe("occurrenceDates", () => {
  it("daily", () => expect(dates("FREQ=DAILY;INTERVAL=1", "2026-10-01", "2026-10-03", "2026-10-05")).toEqual(["2026-10-03", "2026-10-04", "2026-10-05"]));
  it("every 3 days is anchored on the start date", () =>
    expect(dates("FREQ=DAILY;INTERVAL=3", "2026-10-01", "2026-10-01", "2026-10-12")).toEqual(["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"]));
  it("never emits before the start or after until", () => {
    expect(dates("FREQ=DAILY;INTERVAL=1", "2026-10-05", "2026-10-01", "2026-10-07")[0]).toBe("2026-10-05");
    expect(dates("FREQ=DAILY;INTERVAL=1", "2026-10-01", "2026-10-01", "2026-10-30", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
  it("weekdays skip weekends", () =>
    expect(dates(serializeRule(presetRule("weekdays", "2026-10-19")), "2026-10-19", "2026-10-19", "2026-10-26")).toEqual(
      ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"]));
  it("weekly uses the start weekday", () =>
    expect(dates(serializeRule(presetRule("weekly", "2026-10-21")), "2026-10-21", "2026-10-21", "2026-11-11")).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11"]));
  it("every 2 weeks on Mon/Wed", () =>
    expect(dates("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "2026-10-19", "2026-10-19", "2026-11-04")).toEqual(["2026-10-19", "2026-10-21", "2026-11-02", "2026-11-04"]));
  it("monthly clamps to the last day of short months", () =>
    expect(dates("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31", "2026-01-31", "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]));
  it("every 2 months", () =>
    expect(dates("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15", "2026-01-15", "2026-01-01", "2026-07-31")).toEqual(["2026-01-15", "2026-03-15", "2026-05-15", "2026-07-15"]));
  it("is stable across DST transitions (pure calendar dates)", () => {
    // US spring-forward 2026-03-08 and fall-back 2026-11-01; Europe 2026-03-29.
    const d = dates("FREQ=DAILY;INTERVAL=1", "2026-03-06", "2026-03-06", "2026-03-10");
    expect(d).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(dates("FREQ=DAILY;INTERVAL=1", "2026-10-30", "2026-10-30", "2026-11-02")).toHaveLength(4);
  });
  it("bounds a scan with maxDays", () =>
    expect(occurrenceDates(parseRule("FREQ=DAILY;INTERVAL=1")!, { start: "2020-01-01", from: "2020-01-01", to: "2030-01-01", maxDays: 10 })).toHaveLength(10));
});

describe("describeRule", () => {
  it("is human readable", () => {
    expect(describeRule("FREQ=DAILY;INTERVAL=1")).toBe("Every day");
    expect(describeRule("FREQ=DAILY;INTERVAL=3")).toBe("Every 3 days");
    expect(describeRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
    expect(describeRule("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=5")).toBe("Every month on day 5");
  });
});
