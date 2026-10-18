import { createClient } from "@supabase/supabase-js";

const url = process.env.E2E_SUPABASE_URL!;
// Test-process only. Never passed to the Next.js app.
export const service = createClient(url, process.env.E2E_SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});
export const anon = () =>
  createClient(url, process.env.E2E_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

export const ADMIN_EMAIL = "mustakimkhan1111176@gmail.com";
export const USER_EMAIL = "nagorifarhankhan53@gmail.com";
export const PASSWORD = "correct-horse-battery-1";

export async function deleteUserByEmail(email: string) {
  const { data } = await service.auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users) if (u.email === email) await service.auth.admin.deleteUser(u.id);
}

export async function roleOf(email: string): Promise<string | null> {
  const { data } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!data) return null;
  const { data: r } = await service.from("user_roles").select("role").eq("user_id", data.id).maybeSingle();
  return r?.role ?? null;
}

const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54324";

export async function clearMailbox() {
  await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
}

/** Reads the real email delivered to the local Mailpit and returns its /auth/confirm link on `base`. */
export async function emailLink(email: string, base: string, next?: string) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
      const m = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(msg.HTML as string);
      if (m?.[1]) {
        const u = new URL(m[1].replaceAll("&amp;", "&"));
        const out = new URL(`${u.pathname}${u.search}`, base);
        if (next) out.searchParams.set("next", next);
        return out.toString();
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no confirm email for ${email}`);
}
