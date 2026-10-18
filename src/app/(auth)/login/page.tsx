import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { AuthCard } from "@/features/auth/components/ui";
import { safeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

// Fixed messages only: query text is never reflected into the page.
const NOTICES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Request a new one.",
  not_provisioned: "Your account is not set up yet. Contact the administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <AuthCard title="Sign in to Tracker" subtitle="Plan your day, review your progress.">
      <SignInForm next={safeRedirectPath(next)} notice={error ? NOTICES[error] : undefined} />
    </AuthCard>
  );
}
