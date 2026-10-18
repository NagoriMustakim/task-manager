import { describe, expect, it, vi } from "vitest";
import { authorizeSubject } from "./authz";

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin" as const };
const USER = { id: "22222222-2222-4222-8222-222222222222", role: "user" as const };
const OTHER = "33333333-3333-4333-8333-333333333333";

describe("authorizeSubject (runs before any data is read)", () => {
  it("defaults to the requester's own data", async () => {
    const grant = vi.fn();
    expect(await authorizeSubject(USER, undefined, grant)).toBe(USER.id);
    expect(await authorizeSubject(ADMIN, null, grant)).toBe(ADMIN.id);
    expect(await authorizeSubject(USER, USER.id, grant)).toBe(USER.id);
    expect(grant).not.toHaveBeenCalled();
  });
  it("forbids a normal user from requesting anyone else's data, without even checking grants", async () => {
    const grant = vi.fn().mockResolvedValue(true);
    await expect(authorizeSubject(USER, ADMIN.id, grant)).rejects.toMatchObject({ code: "forbidden" });
    await expect(authorizeSubject(USER, OTHER, grant)).rejects.toMatchObject({ code: "forbidden" });
    expect(grant).not.toHaveBeenCalled();
  });
  it("lets an administrator analyse another user only when a read grant exists", async () => {
    expect(await authorizeSubject(ADMIN, OTHER, async () => true)).toBe(OTHER);
    await expect(authorizeSubject(ADMIN, OTHER, async () => false)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("passes the right ids to the grant lookup and rejects malformed ids", async () => {
    const grant = vi.fn().mockResolvedValue(true);
    await authorizeSubject(ADMIN, OTHER, grant);
    expect(grant).toHaveBeenCalledWith(ADMIN.id, OTHER);
    await expect(authorizeSubject(ADMIN, "not-a-uuid", grant)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(authorizeSubject(ADMIN, "' or 1=1 --", grant)).rejects.toMatchObject({ code: "invalid_input" });
  });
});
