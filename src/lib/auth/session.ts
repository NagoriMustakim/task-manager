import "server-only";
import { cache } from "react";
import { unauthorized } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface SessionUser {
  id: string;
  email: string | null;
  role: AppRole;
}

/**
 * Verified identity + trusted role, with ONE database round trip.
 * - Identity: getClaims() verifies the session JWT (no extra network call when the project uses
 *   asymmetric signing keys; it falls back to the Auth server otherwise).
 * - Role: read from public.user_roles (never from user_metadata). Unprovisioned users are signed out.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: row } = await supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle();
  if (!row) return null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return { id, email, role: row.role };
});

/** For pages/layouts: renders unauthorized.tsx (401) when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  return user;
}
