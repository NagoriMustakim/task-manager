import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";
import { AuthCard } from "@/features/auth/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  await requireUser(); // needs the recovery session created by /auth/confirm
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm />
    </AuthCard>
  );
}
