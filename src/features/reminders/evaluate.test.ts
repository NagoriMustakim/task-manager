import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/time";
import { DEFAULT_PREFS, evaluateReminders, validatePrefs, type OpenOcc, type ReminderPrefs } from "./evaluate";

const TZ = "Asia/Kolkata";
const at = (date: string, time: string) => localToInstant(date, time, TZ);
const occ = (o: Partial<OpenOcc> = {}): OpenOcc => ({ id: "o1", taskId: "t1", title: "Write report", priority: "medium", scheduledDate: "2026-10-21", startTime: null, ...o });
const run = (now: Date, prefs: Partial<ReminderPrefs> = {}, data: Partial<Parameters<typeof evaluateReminders>[0]> = {}) =>
  evaluateReminders({ now, timeZone: TZ, prefs: { ...DEFAULT_PREFS, morning: false, endOfDay: false, weekly: false, ...prefs }, weekStartDay: 1, todayOpen: [], overdueHigh: [], deadlines: [], ...data });

describe("task start reminders", () => {
  const todayOpen = [occ({ startTime: "15:00" })];
  it("fire within the lead time, with a stable dedupe key", () => {
    const r = run(at("2026-10-21", "14:52"), {}, { todayOpen });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "task_start", dedupeKey: "start:o1:2026-10-21" });
    expect(r[0]!.title).toMatch(/Starting at 15:00/);
  });
  it("not before the lead window; still shown shortly after; stale after an hour", () => {
    expect(run(at("2026-10-21", "14:40"), {}, { todayOpen })).toHaveLength(0);
    expect(run(at("2026-10-21", "15:20"), {}, { todayOpen })[0]!.title).toMatch(/Started at/);
    expect(run(at("2026-10-21", "16:30"), {}, { todayOpen })).toHaveLength(0);
  });
  it("same key on every evaluation, so repeated polls cannot duplicate", () => {
    const a = run(at("2026-10-21", "14:55"), {}, { todayOpen })[0]!.dedupeKey;
    const b = run(at("2026-10-21", "14:58"), {}, { todayOpen })[0]!.dedupeKey;
    expect(a).toBe(b);
  });
  it("respects the user's lead time and untimed or other-day tasks", () => {
    expect(run(at("2026-10-21", "14:40"), { startLeadMin: 30 }, { todayOpen })).toHaveLength(1);
    expect(run(at("2026-10-21", "14:55"), {}, { todayOpen: [occ({ startTime: null })] })).toHaveLength(0);
    expect(run(at("2026-10-21", "14:55"), {}, { todayOpen: [occ({ startTime: "15:00", scheduledDate: "2026-10-22" })] })).toHaveLength(0);
  });
  it("uses the user's timezone, not the server's", () => {
    // 09:30Z is 15:00 in Kolkata
    const r = evaluateReminders({ now: new Date("2026-10-21T09:25:00Z"), timeZone: TZ, prefs: { ...DEFAULT_PREFS, morning: false, endOfDay: false, weekly: false }, weekStartDay: 1, todayOpen, overdueHigh: [], deadlines: [] });
    expect(r).toHaveLength(1);
    expect(evaluateReminders({ now: new Date("2026-10-21T09:25:00Z"), timeZone: "America/Los_Angeles", prefs: DEFAULT_PREFS, weekStartDay: 1, todayOpen, overdueHigh: [], deadlines: [] }).filter((x) => x.kind === "task_start")).toHaveLength(0);
  });
});

describe("deadlines and overdue", () => {
  const now = at("2026-10-21", "10:00");
  it("warns within N days, once per stage", () => {
    const r = run(now, { deadlineDays: 2 }, { deadlines: [{ taskId: "a", title: "A", deadline: "2026-10-21" }, { taskId: "b", title: "B", deadline: "2026-10-23" }, { taskId: "c", title: "C", deadline: "2026-10-24" }, { taskId: "d", title: "D", deadline: "2026-10-20" }] });
    expect(r.map((x) => x.dedupeKey)).toEqual(["deadline:a:2026-10-21:today", "deadline:b:2026-10-23:soon"]);
  });
  it("overdue high-priority reminders are capped and keyed per day", () => {
    const overdueHigh = Array.from({ length: 8 }, (_, i) => occ({ id: `o${i}`, priority: "high", scheduledDate: "2026-10-18" }));
    const r = run(now, {}, { overdueHigh });
    expect(r).toHaveLength(5);
    expect(r[0]!.dedupeKey).toBe("overdue:o0:2026-10-21");
  });
});

describe("review reminders", () => {
  const all = { morning: true, endOfDay: true, weekly: true };
  it("morning planning appears after the configured time and expires", () => {
    expect(run(at("2026-10-21", "08:00"), all)).toHaveLength(0);
    expect(run(at("2026-10-21", "08:31"), all).map((r) => r.kind)).toEqual(["morning"]);
    expect(run(at("2026-10-21", "13:00"), all)).toHaveLength(0);
  });
  it("end-of-day follows the user's preferred time", () => {
    expect(run(at("2026-10-21", "18:05"), all).map((r) => r.kind)).toEqual(["end_of_day"]);
    expect(run(at("2026-10-21", "19:30"), { ...all, eodTime: "19:00" }).map((r) => r.kind)).toEqual(["end_of_day"]);
  });
  it("weekly review only on the chosen weekday (Sunday 2026-10-25), keyed by week start", () => {
    expect(run(at("2026-10-25", "17:10"), all).map((r) => r.kind)).toContain("weekly");
    expect(run(at("2026-10-25", "17:10"), all).find((r) => r.kind === "weekly")!.dedupeKey).toBe("weekly:2026-10-19");
    expect(run(at("2026-10-24", "17:10"), all).map((r) => r.kind)).not.toContain("weekly");
    expect(run(at("2026-10-24", "17:10"), { ...all, weeklyDay: 6 }).map((r) => r.kind)).toContain("weekly");
  });
  it("review times use the user's timezone", () => {
    // 03:10Z = 08:40 in Kolkata (morning), but 20:10 the previous evening in Los Angeles.
    const now = new Date("2026-10-21T03:10:00Z");
    const base = { weekStartDay: 1, todayOpen: [], overdueHigh: [], deadlines: [] };
    expect(evaluateReminders({ now, timeZone: TZ, prefs: DEFAULT_PREFS, ...base }).map((r) => r.kind)).toContain("morning");
    expect(evaluateReminders({ now, timeZone: "America/Los_Angeles", prefs: DEFAULT_PREFS, ...base }).map((r) => r.kind)).not.toContain("morning");
  });
});

describe("preferences", () => {
  it("master switch and per-type switches disable reminders", () => {
    const now = at("2026-10-21", "08:45");
    expect(run(now, { enabled: false, morning: true })).toEqual([]);
    expect(run(now, { morning: false })).toEqual([]);
    expect(run(at("2026-10-21", "14:55"), { taskStart: false }, { todayOpen: [occ({ startTime: "15:00" })] })).toEqual([]);
    expect(run(at("2026-10-21", "10:00"), { deadline: false }, { deadlines: [{ taskId: "a", title: "A", deadline: "2026-10-21" }] })).toEqual([]);
    expect(run(at("2026-10-21", "10:00"), { overdueHigh: false }, { overdueHigh: [occ({ priority: "urgent", scheduledDate: "2026-10-20" })] })).toEqual([]);
  });
  it("validates preference inputs", () => {
    expect(validatePrefs(DEFAULT_PREFS)).toBeNull();
    expect(validatePrefs({ ...DEFAULT_PREFS, morningTime: "25:00" })).toMatch(/HH:MM/);
    expect(validatePrefs({ ...DEFAULT_PREFS, startLeadMin: 500 })).toMatch(/lead/);
    expect(validatePrefs({ ...DEFAULT_PREFS, deadlineDays: -1 })).toMatch(/Deadline/);
    expect(validatePrefs({ ...DEFAULT_PREFS, weeklyDay: 9 })).toMatch(/weekday/);
  });
  it("produces nothing for an empty day", () => expect(run(at("2026-10-21", "12:00"))).toEqual([]));
});
