import { describe, expect, it } from "vitest";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "./schemas";

describe("auth schemas", () => {
  it("normalises email case and whitespace", () => {
    const r = forgotSchema.parse({ email: "  MustakimKhan1111176@Gmail.com " });
    expect(r.email).toBe("mustakimkhan1111176@gmail.com");
  });
  it("rejects invalid email", () => expect(signInSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false));
  it("requires 10+ char passwords on signup", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "short", confirm: "short" }).success).toBe(false);
  });
  it("requires matching confirmation", () => {
    const r = resetSchema.safeParse({ password: "correct-horse-1", confirm: "different-horse" });
    expect(r.success).toBe(false);
  });
  it("ignores extra fields such as role (mass-assignment)", () => {
    const r = signUpSchema.parse({ email: "a@b.co", password: "correct-horse-1", confirm: "correct-horse-1", role: "admin" });
    expect("role" in r).toBe(false);
  });
  it("rejects passwords over 72 chars", () => {
    const p = "a".repeat(73);
    expect(resetSchema.safeParse({ password: p, confirm: p }).success).toBe(false);
  });
});
