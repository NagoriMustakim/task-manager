import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";
import { AuthCard } from "@/features/auth/components/ui";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" subtitle="Enter your email and we'll send a reset link.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
