import { describe, expect, it } from "vitest";
import { addDays, dateInZone, daysBetween, isIsoDate, isValidTimeZone, todayIn, weekdayOf } from "./dates";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
  });
  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
  it("computes 'today' in the user's timezone, not the server's", () => {
    const instant = new Date("2026-10-18T20:00:00Z"); // 01:30 on the 19th in Kolkata
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-19");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-18");
    expect(dateInZone("2026-10-18T20:00:00Z", "Asia/Kolkata")).toBe("2026-10-19");
  });
  it("changing timezone changes 'today' but never an existing calendar date", () => {
    const stored = "2026-10-18";
    expect(addDays(stored, 0)).toBe(stored);
    expect(todayIn("Pacific/Auckland", new Date("2026-10-18T12:00:00Z"))).toBe("2026-10-19");
  });
  it("handles DST days in zone conversion", () => {
    expect(dateInZone("2026-03-08T10:30:00Z", "America/New_York")).toBe("2026-03-08");
    expect(todayIn("Asia/Kolkata", new Date("2026-03-28T19:00:00Z"))).toBe("2026-03-29");
  });
  it("rejects unknown timezones and finds weekdays", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(weekdayOf("2026-10-19")).toBe(1);
  });
});
