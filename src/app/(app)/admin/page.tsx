import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin(); // 403 for non-admins, regardless of how they reached the URL
  const supabase = await createClient();
  // Runs under the admin's own JWT: RLS (not this page) limits which profiles are visible.
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, created_at, user_roles!user_roles_user_id_fkey(role)")
    .order("created_at");

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Users</h1>
      {error ? (
        <p role="alert" className="mt-4 text-danger">Could not load users.</p>
      ) : !users?.length ? (
        <p className="mt-4 text-ink-muted">No users yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-4 py-2.5">
              <span>{u.email}</span>
              <span className="text-[13px] text-ink-muted">{u.user_roles?.role ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
