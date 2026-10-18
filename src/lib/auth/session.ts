import "server-only";
import { cache } from "react";
import { forbidden, unauthorized } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
}

/**
 * Verified identity + trusted role/profile.
 * - Identity: supabase.auth.getUser() (validated against the Auth server, not just the cookie).
 * - Role/profile: read from public.user_roles / public.profiles under RLS (own rows only).
 *   user_metadata is never consulted. Returns null when unauthenticated or unprovisioned.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const [{ data: roleRow }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("profiles").select("email, display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!roleRow) return null; // no trusted role => treated as unauthenticated

  return {
    id: auth.user.id,
    email: profile?.email ?? auth.user.email ?? null,
    displayName: profile?.display_name ?? null,
    role: roleRow.role,
  };
});

/** For pages/layouts: renders unauthorized.tsx (401) when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  return user;
}

/** For pages/layouts: 401 if signed out, 403 (forbidden.tsx) if not an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") forbidden();
  return user;
}
