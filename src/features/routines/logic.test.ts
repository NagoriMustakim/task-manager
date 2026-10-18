import { describe, expect, it } from "vitest";
import { occurrenceDates, parseRule } from "@/lib/recurrence";
import { chipState, summarise, type OccLite } from "./logic";

const o = (id: string, scheduledDate: string, status: OccLite["status"] = "new", moved = false): OccLite => ({ id, scheduledDate, status, moved });
const T = "2026-10-21";

describe("occurrence states are independent", () => {
  it("each occurrence has its own state; missing one does not affect the next", () => {
    const s = summarise([o("a", "2026-10-19", "done"), o("b", "2026-10-20", "new"), o("c", "2026-10-21", "pending"), o("d", "2026-10-22"), o("e", "2026-10-18", "incomplete"), o("f", "2026-10-17", "pending", true)], T);
    expect(s.states.map((x) => [x.id, x.state])).toEqual([["f", "moved"], ["e", "incomplete"], ["a", "done"], ["b", "missed"], ["c", "today"], ["d", "upcoming"]]);
    expect([s.done, s.incomplete, s.missed, s.moved]).toEqual([1, 1, 1, 1]);
    expect(s.nextDate).toBe("2026-10-21");
  });
  it("classification", () => {
    expect(chipState(o("x", "2026-10-20"), T)).toBe("missed");
    expect(chipState(o("x", "2026-10-20", "done"), T)).toBe("done");
    expect(chipState(o("x", "2026-10-20", "new", true), T)).toBe("moved");
  });
  it("handles an empty routine", () => expect(summarise([], T)).toMatchObject({ done: 0, missed: 0, nextDate: null, states: [] }));
});

/** Models the database rules for editing a rule going forward (update_recurrence). */
function applyRuleChange(existing: { date: string; status: OccLite["status"]; touched: boolean }[], newRule: string, from: string, horizon: string) {
  const kept = existing.filter((e) => e.date < from || e.touched || e.status !== "new"); // past + touched survive
  const keptDates = new Set(kept.map((e) => e.date));
  const generated = occurrenceDates(parseRule(newRule)!, { start: from, from, to: horizon }).filter((d) => !keptDates.has(d));
  return { kept, generated };
}

describe("editing the future recurrence rule does not rewrite the past", () => {
  const daily = occurrenceDates(parseRule("FREQ=DAILY;INTERVAL=1")!, { start: "2026-10-15", from: "2026-10-15", to: "2026-10-28" });
  const existing = daily.map((date) => ({ date, status: (date === "2026-10-16" ? "done" : date === "2026-10-23" ? "pending" : "new") as OccLite["status"], touched: date === "2026-10-23" }));
  const change = applyRuleChange(existing, "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", "2026-10-22", "2026-11-09");
  it("keeps every past occurrence exactly as it was", () => {
    const past = change.kept.filter((e) => e.date < "2026-10-22");
    expect(past.map((e) => e.date)).toEqual(daily.filter((d) => d < "2026-10-22"));
    expect(past.find((e) => e.date === "2026-10-16")!.status).toBe("done");
  });
  it("keeps future occurrences the user already touched", () => expect(change.kept.map((e) => e.date)).toContain("2026-10-23"));
  it("regenerates untouched future ones under the new rule only", () => {
    expect(change.generated).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(change.kept.some((e) => e.date === "2026-10-24")).toBe(false);
  });
  it("never creates duplicates on dates that already have an entry", () => {
    const all = [...change.kept.map((e) => e.date), ...change.generated];
    expect(new Set(all).size).toBe(all.length);
  });
  it("switching rule and switching back is stable", () => {
    const back = applyRuleChange(change.kept.map((e) => ({ ...e })), "FREQ=DAILY;INTERVAL=1", "2026-10-22", "2026-10-28");
    expect(back.generated).toContain("2026-10-24");
  });
});
