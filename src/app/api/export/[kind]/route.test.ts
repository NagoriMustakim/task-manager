import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = vi.fn();
const grant = vi.fn();
const settings = vi.fn();
const build = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => session() }));
vi.mock("@/lib/auth/grant", () => ({ hasReadGrant: (...a: unknown[]) => grant(...a) }));
vi.mock("@/features/tasks/queries", () => ({ getUserSettings: (...a: unknown[]) => settings(...a) }));
vi.mock("@/features/exports/data", () => {
  class TooManyRows extends Error {}
  return { TooManyRows, buildExport: (...a: unknown[]) => build(...a) };
});

import { GET } from "./route";

const ME = { id: "11111111-1111-4111-8111-111111111111", role: "user" as const };
const ADMIN = { id: "22222222-2222-4222-8222-222222222222", role: "admin" as const };
const OTHER = "33333333-3333-4333-8333-333333333333";
const call = (kind: string, qs = "") => GET(new NextRequest(`http://localhost/api/export/${kind}${qs}`), { params: Promise.resolve({ kind }) });

beforeEach(() => {
  for (const m of [session, grant, settings, build]) m.mockReset();
  session.mockResolvedValue(ME);
  settings.mockResolvedValue({ timezone: "Asia/Kolkata", today: "2026-10-21", weekStartDay: 1 });
  build.mockResolvedValue({ columns: ["title", "n"], rows: [["=cmd|' /C calc'!A0", 1], ["ok", 2]] });
});

describe("export authorization (independent of the UI)", () => {
  it("rejects anonymous requests before touching any data", async () => {
    session.mockResolvedValue(null);
    expect((await call("tasks")).status).toBe(401);
    expect(build).not.toHaveBeenCalled();
  });
  it("a normal user cannot export another user's data, even with a guessed id", async () => {
    const res = await call("occurrences", `?subject=${ADMIN.id}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to that user's data." });
    expect(grant).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });
  it("an administrator without a grant is refused; with a grant the subject's data is exported", async () => {
    session.mockResolvedValue(ADMIN);
    grant.mockResolvedValueOnce(false);
    expect((await call("tasks", `?subject=${OTHER}`)).status).toBe(403);
    expect(build).not.toHaveBeenCalled();
    grant.mockResolvedValueOnce(true);
    const ok = await call("tasks", `?subject=${OTHER}`);
    expect(ok.status).toBe(200);
    expect(build.mock.calls[0]![2]).toBe(OTHER);
    expect(settings).toHaveBeenCalledWith(OTHER);
    expect(ok.headers.get("Content-Disposition")).toContain(OTHER.slice(0, 8));
  });
  it("without a subject, even an administrator exports only their own data", async () => {
    session.mockResolvedValue(ADMIN);
    await call("tasks");
    expect(build.mock.calls[0]![2]).toBe(ADMIN.id);
    expect(grant).not.toHaveBeenCalled();
  });
  it("rejects malformed subject ids", async () => {
    session.mockResolvedValue(ADMIN);
    expect((await call("tasks", "?subject=' or 1=1")).status).toBe(400);
  });
});

describe("export behaviour", () => {
  it("returns a downloadable, uncached, injection-safe CSV with a useful filename", async () => {
    const res = await call("occurrences", "?from=2026-10-01&to=2026-10-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="tracker-occurrences_2026-10-01_to_2026-10-31.csv"');
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(res.headers.get("X-Row-Count")).toBe("2");
    const text = await res.text();
    expect(text).toContain("title,n");
    expect(text).toContain("\r\n'=cmd|' /C calc'!A0,1"); // formula neutralised with a leading apostrophe
    expect(text).not.toMatch(/(^|,|\n)=cmd/);
  });
  it("an empty dataset still downloads a header-only file", async () => {
    build.mockResolvedValue({ columns: ["a", "b"], rows: [] });
    const res = await call("time");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Row-Count")).toBe("0");
    expect((await res.text()).replace("﻿", "")).toBe("a,b\r\n");
  });
  it("applies the date filters to the builder and defaults to the last 30 days", async () => {
    await call("history", "?from=2026-10-05&to=2026-10-06");
    expect(build.mock.calls[0]![1]).toEqual({ from: "2026-10-05", to: "2026-10-06" });
    await call("history");
    expect(build.mock.calls[1]![1]).toEqual({ from: "2026-09-22", to: "2026-10-21" });
  });
  it("validates kind and dates", async () => {
    expect((await call("secrets")).status).toBe(404);
    expect((await call("tasks", "?from=2026-10-31&to=2026-10-01")).status).toBe(400);
    expect((await call("tasks", "?from=2020-01-01&to=2026-10-01")).status).toBe(400);
    expect((await call("tasks", "?from=junk")).status).toBe(400);
  });
  it("maps too-many-rows and internal failures to safe messages", async () => {
    const { TooManyRows } = await import("@/features/exports/data");
    build.mockRejectedValueOnce(new TooManyRows());
    expect((await call("tasks")).status).toBe(413);
    build.mockRejectedValueOnce(new Error("connection string postgres://user:pw@host leaked"));
    const res = await call("tasks");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/postgres|pw@|leaked/);
  });
});
