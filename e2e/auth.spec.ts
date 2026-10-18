import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL, PASSWORD, USER_EMAIL, anon, clearMailbox, deleteUserByEmail, emailLink, roleOf, service,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3100";
const alertOf = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

async function signIn(page: Page, email: string, password = PASSWORD, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email\?kind=signup/);
}

test.beforeAll(async () => {
  await clearMailbox();
  for (const e of [ADMIN_EMAIL, USER_EMAIL, "meta@example.com"]) await deleteUserByEmail(e);
});

test("unauthenticated access is rejected with correct responses", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(`${BASE}/login`);
  await page.goto("/admin");
  await expect(page).toHaveURL(`${BASE}/login?next=%2Fadmin`);
  expect((await request.get("/api/me", { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get("/api/admin/overview", { maxRedirects: 0 })).status()).toBe(401);
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/login/);
});

test("normal user: signup, verification gate, verified login, no admin access", async ({ page }) => {
  await signUp(page, USER_EMAIL);
  expect(await roleOf(USER_EMAIL)).toBe("user");

  await signIn(page, USER_EMAIL);
  await expect(alertOf(page)).toContainText("Verify your email");

  await page.goto(await emailLink(USER_EMAIL, BASE));
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByText(`signed in as ${USER_EMAIL}`)).toContainText("(user)");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email: USER_EMAIL, role: "user" });

  const res = await page.goto("/admin");
  expect(res?.status()).toBe(403);
  await expect(page.getByText("Not allowed")).toBeVisible();
  expect((await page.request.get("/api/admin/overview")).status()).toBe(403);

  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${BASE}/login`);
  expect((await page.request.get("/api/me", { maxRedirects: 0 })).status()).toBe(401);
});

test("wrong password and unknown email give the same message", async ({ page }) => {
  await signIn(page, USER_EMAIL, "wrong-password-123");
  await expect(alertOf(page)).toHaveText("Invalid email or password.");
  await signIn(page, "nobody@example.com");
  await expect(alertOf(page)).toHaveText("Invalid email or password.");
});

test("registering the admin email does NOT grant admin until the mailbox is verified", async ({ page }) => {
  await signUp(page, ADMIN_EMAIL);
  expect(await roleOf(ADMIN_EMAIL)).toBe("user"); // unconfirmed => plain user
  await signIn(page, ADMIN_EMAIL);
  await expect(alertOf(page)).toContainText("Verify your email");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/admin/overview", { maxRedirects: 0 })).status()).toBe(401);

  await page.goto(await emailLink(ADMIN_EMAIL, BASE, "/admin"));
  expect(await roleOf(ADMIN_EMAIL)).toBe("admin"); // promoted at confirmation by the DB trigger
  await expect(page).toHaveURL(`${BASE}/admin`);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByText(USER_EMAIL)).toBeVisible();
  const ov = await page.request.get("/api/admin/overview");
  expect(ov.status()).toBe(200);
  expect((await ov.json()).visibleUsers).toBeGreaterThanOrEqual(2);
});

test("post-login redirects are validated", async ({ page }) => {
  for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
    await signIn(page, USER_EMAIL, PASSWORD, evil);
    await expect(page).toHaveURL(`${BASE}/`);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${BASE}/login`);
  }
  await signIn(page, ADMIN_EMAIL, PASSWORD, "/admin");
  await expect(page).toHaveURL(`${BASE}/admin`);
  await page.goto("/login");
  await expect(page).toHaveURL(`${BASE}/`); // signed-in users skip the login page
  await page.getByRole("button", { name: "Sign out" }).click();
});

test("forgot/reset password flow", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(USER_EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page).toHaveURL(/check-email\?kind=reset/);
  // Unknown address looks identical:
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("ghost@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page).toHaveURL(/check-email\?kind=reset/);

  await page.goto(await emailLink(USER_EMAIL, BASE));
  await expect(page).toHaveURL(`${BASE}/reset-password`);
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password-2");
  await page.getByLabel("Confirm new password").fill("different-password-333");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  // React resets uncontrolled fields after an action; password fields are intentionally cleared.
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password-2");
  await page.getByLabel("Confirm new password").fill("a-brand-new-password-2");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(`${BASE}/`);
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, USER_EMAIL, PASSWORD);
  await expect(alertOf(page)).toHaveText("Invalid email or password.");
  await signIn(page, USER_EMAIL, "a-brand-new-password-2");
  await expect(page).toHaveURL(`${BASE}/`);
});

test("invalid or reused email links fail safely", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=email&next=/");
  await expect(page).toHaveURL(/\/login\?error=link_invalid/);
  await expect(alertOf(page)).toContainText("invalid or has expired");
  await page.goto("/auth/confirm?token_hash=x&type=email&next=//evil.example");
  await expect(page).toHaveURL(/\/login\?error=link_invalid/);
});

test("database: users cannot escalate roles directly; metadata role is ignored", async () => {
  // metadata escalation attempt at signup
  const a = anon();
  await a.auth.signUp({ email: "meta@example.com", password: PASSWORD, options: { data: { role: "admin" } } });
  expect(await roleOf("meta@example.com")).toBe("user");

  // sign in as the verified normal user and hit PostgREST directly
  const c = anon();
  const { data: s, error } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: "a-brand-new-password-2" });
  expect(error).toBeNull();
  const uid = s.user!.id;

  const upd = await c.from("user_roles").update({ role: "admin" }).eq("user_id", uid).select();
  expect(upd.error?.code).toBe("42501"); // no UPDATE privilege
  const ins = await c.from("user_roles").insert({ user_id: uid, role: "admin" });
  expect(ins.error?.code).toBe("42501");
  const roles = await c.from("user_roles").select("*");
  expect(roles.data).toHaveLength(1); // own row only
  const profiles = await c.from("profiles").select("*");
  expect(profiles.data).toHaveLength(1);
  const emailEdit = await c.from("profiles").update({ email: "x@y.z" }).eq("id", uid).select();
  expect(emailEdit.error?.code).toBe("42501");
  const meta = await c.auth.updateUser({ data: { role: "admin" } });
  expect(meta.error).toBeNull();
  expect(await roleOf(USER_EMAIL)).toBe("user"); // metadata edit changes nothing
  const forged = await c.from("task_events").insert({ user_id: uid, task_id: uid, event_type: "task_created" });
  expect(forged.error?.code).toBe("42501");
  const audit = await c.from("role_audit_log").select("*");
  expect(audit.data).toHaveLength(0);

  // own data works, other's data is invisible
  const t = await c.from("tasks").insert({ title: "mine" }).select().single();
  expect(t.error).toBeNull();
  const adminId = (await service.from("profiles").select("id").eq("email", ADMIN_EMAIL).single()).data!.id;
  const spoof = await c.from("tasks").insert({ title: "x", user_id: adminId });
  expect(spoof.error).not.toBeNull();

  // anonymous key sees nothing
  const anonRead = await anon().from("tasks").select("*");
  expect(anonRead.error?.code).toBe("42501");
});
