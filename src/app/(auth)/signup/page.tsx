import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { AuthCard } from "@/features/auth/components/ui";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account" subtitle="We'll email you a link to verify your address.">
      <SignUpForm />
    </AuthCard>
  );
}
