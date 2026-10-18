import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/tasks", "/tasks"],
    ["/tasks?day=2026-10-18#top", "/tasks?day=2026-10-18#top"],
    ["/admin", "/admin"],
  ])("allows %s", (input, expected) => expect(safeRedirectPath(input)).toBe(expected));

  it.each([
    "https://evil.com",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/%2F%2Fevil.com",
    "/%5Cevil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    "/login",
    "/signup?x=1",
    "/auth/confirm",
    "/ok\nSet-Cookie: a=b",
    "/%0d%0aLocation:x",
    "/%E0%A4%A",
  ])("rejects %j", (input) => expect(safeRedirectPath(input)).toBe("/"));

  it("rejects non-strings and uses the fallback", () => {
    expect(safeRedirectPath(null, "/home")).toBe("/home");
    expect(safeRedirectPath(["/a"], "/home")).toBe("/home");
    expect(safeRedirectPath("x".repeat(3000))).toBe("/");
  });
});
