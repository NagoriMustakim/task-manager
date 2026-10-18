import Link from "next/link";

export default function Unauthorized() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-xl font-semibold">401 · Sign in required</h1>
      <p className="text-ink-muted">Your session has ended or your account isn&apos;t set up yet.</p>
      <Link href="/login" className="mt-2 text-accent hover:underline">Go to sign in</Link>
    </main>
  );
}
