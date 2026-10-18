import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const reset = kind === "reset";
  return (
    <AuthCard title="Check your email">
      <p>
        {reset
          ? "If an account exists for that address, a password reset link is on its way."
          : "If that address can be registered, a verification link is on its way. Open it to finish creating your account."}
      </p>
      <p className="mt-3 text-[13px] text-ink-muted">The link expires after a short time. Check spam if you don&apos;t see it.</p>
      <Link href="/login" className="mt-4 inline-block text-[13px] text-accent hover:underline">Back to sign in</Link>
    </AuthCard>
  );
}
