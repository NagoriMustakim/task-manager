import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-xl font-semibold">403 · Not allowed</h1>
      <p className="text-ink-muted">You don&apos;t have permission to view this page.</p>
      <Link href="/" className="mt-2 text-accent hover:underline">Go home</Link>
    </main>
  );
}
