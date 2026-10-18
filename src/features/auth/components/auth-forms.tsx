"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "../actions";
import type { FormState } from "../schemas";
import { Alert, Field, SubmitButton } from "./ui";

const initial: FormState = {};
const linkClass = "text-accent hover:underline";

export function SignInForm({ next, notice }: { next: string; notice?: string | undefined }) {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice ? <Alert>{notice}</Alert> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <div className="flex justify-between text-[13px]">
        <Link className={linkClass} href="/forgot-password">Forgot password?</Link>
        <Link className={linkClass} href="/signup">Create account</Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} error={state.fieldErrors?.password} required />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} required />
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-[13px] text-ink-muted">
        Already have an account? <Link className={linkClass} href="/login">Sign in</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} required autoFocus />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      <p className="text-[13px]"><Link className={linkClass} href="/login">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={10} error={state.fieldErrors?.password} required autoFocus />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} required />
      <SubmitButton pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
