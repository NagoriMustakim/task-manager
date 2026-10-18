import { describe, expect, it } from "vitest";
import { addEntrySchema, startSchema, stopSchema, validateEntry } from "./schemas";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const v = (s: string, e: string) => validateEntry({ startedAt: s, endedAt: e }, NOW);

describe("manual entry validation", () => {
  it("accepts a normal past session, including one that crosses midnight", () => {
    expect(v("2026-10-17T18:00:00Z", "2026-10-17T19:00:00Z")).toBeNull();
    expect(v("2026-10-17T22:00:00Z", "2026-10-18T02:00:00Z")).toBeNull();
  });
  it("rejects end <= start, future end, and >24h", () => {
    expect(v("2026-10-17T10:00:00Z", "2026-10-17T10:00:00Z")).toMatch(/after start/);
    expect(v("2026-10-17T11:00:00Z", "2026-10-17T10:00:00Z")).toMatch(/after start/);
    expect(v("2026-10-18T11:00:00Z", "2026-10-18T13:00:00Z")).toMatch(/future/);
    expect(v("2026-10-16T10:00:00Z", "2026-10-17T10:00:01Z")).toMatch(/24 hours/);
  });
  it("allows a minute of clock skew", () => expect(v("2026-10-18T11:00:00Z", "2026-10-18T12:00:30Z")).toBeNull());
});

describe("schemas", () => {
  it("require uuids and ISO instants with offsets", () => {
    expect(startSchema.safeParse({ occurrenceId: "nope" }).success).toBe(false);
    const base = { occurrenceId: "11111111-1111-4111-8111-111111111111", startedAt: "2026-10-18T10:00:00Z", endedAt: "2026-10-18T11:00:00Z" };
    expect(addEntrySchema.safeParse(base).success).toBe(true);
    expect(addEntrySchema.safeParse({ ...base, startedAt: "2026-10-18 10:00" }).success).toBe(false);
  });
  it("never accepts a user id (ownership comes from the session, not the payload)", () => {
    const r = addEntrySchema.parse({ occurrenceId: "11111111-1111-4111-8111-111111111111", startedAt: "2026-10-18T10:00:00Z", endedAt: "2026-10-18T11:00:00Z", userId: "x" } as never);
    expect("userId" in r).toBe(false);
  });
  it("stop accepts an empty payload (idempotent stop of the running timer)", () => expect(stopSchema.safeParse({}).success).toBe(true));
});
