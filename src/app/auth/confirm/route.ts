import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect";

const OTP_TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "invite", "magiclink", "email_change"];

/**
 * Email-link landing (verification, password recovery). Exchanges the one-time token hash
 * for a session cookie, then redirects to a validated same-origin path.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/");

  const fail = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=link_invalid";
    return NextResponse.redirect(url);
  };

  const code = searchParams.get("code");

  const supabase = await createClient();
  // Works with both Supabase email styles: ?code= (default "ConfirmationURL" templates, PKCE) and ?token_hash= (custom templates).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
    return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }
  if (!tokenHash || !type || !OTP_TYPES.includes(type)) return fail();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  const target = new URL(type === "recovery" ? "/reset-password" : next, request.nextUrl.origin);
  return NextResponse.redirect(target);
}
