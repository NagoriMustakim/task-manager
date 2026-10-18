import { describe, expect, it } from "vitest";
import { Aliaser } from "./payload";
import { resolveCarry, resolveInsights, resolvePlan, validateDraft } from "./postprocess";
import type { Plan } from "./schemas";

const mk = () => { const a = new Aliaser(); ["A", "B", "C", "D"].forEach((id) => a.alias(id)); return a; }; // t1..t4 -> A..D
const plan = (o: Partial<Plan>): Plan => ({ summary: "s", overloaded: false, overloadReason: null, blocks: [], defer: [], tips: [], ...o });
const ctx = { today: "2026-10-21", workStart: "09:00", workEnd: "18:00", fixed: [{ start: "12:00", end: "13:00" }], schedulable: new Set(["A", "B", "C"]) };

describe("resolvePlan: the model cannot schedule what it was not given", () => {
  it("keeps valid blocks and maps refs to real ids", () => {
    const r = resolvePlan(plan({ blocks: [{ alias: "t1", start: "09:00", end: "10:00", note: null }, { alias: "t2", start: "10:00", end: "11:30", note: "deep work" }] }), mk(), ctx);
    expect(r.blocks.map((b) => b.id)).toEqual(["A", "B"]);
    expect(r.dropped).toBe(0);
  });
  it("drops hallucinated refs, injected ids, fixed tasks, duplicates, overlaps, out-of-hours and inverted ranges", () => {
    const r = resolvePlan(plan({ blocks: [
      { alias: "t99", start: "09:00", end: "10:00", note: null },          // unknown ref
      { alias: "A", start: "09:00", end: "10:00", note: null },            // real id, not a ref
      { alias: "t4", start: "09:00", end: "10:00", note: null },           // known but not schedulable (fixed commitment)
      { alias: "t1", start: "09:00", end: "10:00", note: null },           // ok
      { alias: "t1", start: "14:00", end: "15:00", note: null },           // duplicate
      { alias: "t2", start: "09:30", end: "10:30", note: null },           // overlaps t1
      { alias: "t2", start: "12:30", end: "13:30", note: null },           // overlaps fixed lunch
      { alias: "t3", start: "17:30", end: "19:00", note: null },           // after work hours
      { alias: "t3", start: "16:00", end: "15:00", note: null },           // inverted
    ] }), mk(), ctx);
    expect(r.blocks.map((b) => b.id)).toEqual(["A"]);
    expect(r.dropped).toBe(8);
  });
  it("converts deferrals to concrete dates and refuses 'today' or scheduled tasks", () => {
    const r = resolvePlan(plan({
      blocks: [{ alias: "t1", start: "09:00", end: "10:00", note: null }],
      defer: [{ alias: "t2", daysFromToday: 1, reason: "r" }, { alias: "t3", daysFromToday: 0, reason: "x" }, { alias: "t1", daysFromToday: 2, reason: "y" }, { alias: "zz", daysFromToday: 2, reason: "z" }],
    }), mk(), ctx);
    expect(r.defer).toEqual([{ id: "B", date: "2026-10-22", reason: "r" }]);
    expect(r.dropped).toBe(3);
  });
});

describe("resolveCarry", () => {
  it("only recommends candidate tasks, once each, with server-computed dates", () => {
    const r = resolveCarry({ items: [{ alias: "t1", daysFromToday: 1, reason: "a" }, { alias: "t1", daysFromToday: 2, reason: "dup" }, { alias: "t4", daysFromToday: 1, reason: "not a candidate" }, { alias: "t9", daysFromToday: 0, reason: "?" }], note: null }, mk(), { today: "2026-10-21", candidates: new Set(["A", "B"]) });
    expect(r.items).toEqual([{ id: "A", date: "2026-10-22", reason: "a" }]);
    expect(r.dropped).toBe(3);
  });
});

describe("validateDraft: no silent wrong dates or times", () => {
  const raw = { title: "Finish API", date: "2026-10-22", startTime: "15:00", endTime: null, priority: "high" as const, durationMinutes: 90, ambiguities: [], confidence: "high" as const };
  it("accepts a clean draft without forcing review", () => expect(validateDraft(raw, { today: "2026-10-21" })).toMatchObject({ date: "2026-10-22", needsReview: false }));
  it("nulls impossible dates and flags review", () => {
    const d = validateDraft({ ...raw, date: "2026-02-31" }, { today: "2026-10-21" });
    expect(d.date).toBeNull();
    expect(d.needsReview).toBe(true);
    expect(d.ambiguities.join(" ")).toMatch(/date/i);
  });
  it("rejects absurdly far dates", () => expect(validateDraft({ ...raw, date: "2099-01-01" }, { today: "2026-10-21" }).date).toBeNull());
  it("drops an end time that is not after the start, and flags past dates", () => {
    const d = validateDraft({ ...raw, startTime: "15:00", endTime: "14:00", date: "2026-10-01" }, { today: "2026-10-21" });
    expect(d.endTime).toBeNull();
    expect(d.ambiguities.length).toBeGreaterThanOrEqual(2);
    expect(d.needsReview).toBe(true);
  });
  it("requires review for medium confidence, model-reported ambiguity, or a missing date", () => {
    expect(validateDraft({ ...raw, confidence: "medium" }, { today: "2026-10-21" }).needsReview).toBe(true);
    expect(validateDraft({ ...raw, ambiguities: ["which Friday?"] }, { today: "2026-10-21" }).needsReview).toBe(true);
    expect(validateDraft({ ...raw, date: null }, { today: "2026-10-21" }).needsReview).toBe(true);
  });
});

describe("resolveInsights", () => {
  it("drops metric references that do not exist and unknown task refs", () => {
    const r = resolveInsights({
      headline: "h",
      points: [{ title: "a", detail: "d", metricRefs: ["completionRatePct", "madeUpMetric"] }, { title: "b", detail: "d", metricRefs: ["invented"] }],
      attention: [{ alias: "t1", reason: "r" }, { alias: "t77", reason: "?" }], nextSteps: [],
    }, mk(), new Set(["completionRatePct"]));
    expect(r.points[0]!.metricRefs).toEqual(["completionRatePct"]);
    expect(r.unsupportedPoints).toBe(1);
    expect(r.attention).toEqual([{ id: "A", reason: "r" }]);
    expect(r.dropped).toBe(1);
  });
});
