import "server-only";
import { headers } from "next/headers";

/**
 * Origin used in email links. Prefers NEXT_PUBLIC_SITE_URL (must be in the Supabase
 * redirect allow-list); falls back to the request origin for local development.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
