"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/site-url";
import {
  forgotSchema,
  resetSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  type FormState,
} from "./schemas";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error), email: str(fd, "email") };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const unverified = error.code === "email_not_confirmed";
    return {
      email: parsed.data.email,
      error: unverified
        ? "Verify your email first: open the link we sent you."
        : // Deliberately identical for unknown email and wrong password.
          "Invalid email or password.",
    };
  }
  redirect(safeRedirectPath(fd.get("next")));
}

export async function signUpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: str(fd, "email"),
    password: str(fd, "password"),
    confirm: str(fd, "confirm"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error), email: str(fd, "email") };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // No role or other privileged data is ever sent; roles are assigned in the database.
  });
  if (error) {
    if (error.code === "weak_password") {
      return { email: parsed.data.email, fieldErrors: { password: "That password is too easy to guess." } };
    }
    if (error.status === 429) return { email: parsed.data.email, error: "Too many attempts. Try again later." };
    return { email: parsed.data.email, error: "We could not create the account. Try again." };
  }
  // Same response whether or not the address already exists (no account enumeration).
  redirect("/check-email?kind=signup");
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), email: str(fd, "email") };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
  });
  redirect("/check-email?kind=reset"); // identical outcome for unknown emails
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from your current one."
          : error.code === "weak_password"
            ? "That password is too easy to guess."
            : "Could not update the password. Request a new reset link.",
    };
  }
  await supabase.auth.signOut({ scope: "others" }); // end other sessions after a password change
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
