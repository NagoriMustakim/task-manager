import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

const PUBLIC_PAGES = ["/login", "/signup", "/forgot-password", "/check-email", "/auth/confirm"];
const AUTH_ONLY_WHEN_SIGNED_OUT = ["/login", "/signup", "/forgot-password"];

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookies on every request and gates pages.
 * This is an optimistic first line of defence only; every page, layout, route handler
 * and server action re-verifies on the server (see lib/auth/session.ts) and the
 * database enforces access through RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims (token refresh happens here).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, search = "") => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    target.search = search;
    const redirect = NextResponse.redirect(target);
    // Preserve any refreshed session cookies on the redirect response.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (path.startsWith("/api/")) return response; // route handlers answer 401/403 themselves

  if (!signedIn && !matches(path, PUBLIC_PAGES)) {
    const next = path + request.nextUrl.search;
    return redirectTo("/login", next === "/" ? "" : `?next=${encodeURIComponent(next)}`);
  }
  if (signedIn && matches(path, AUTH_ONLY_WHEN_SIGNED_OUT)) return redirectTo("/");
  return response;
}
