import Link from "next/link";
import { PageHeader } from "./page-header";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
        <p className="font-medium">Not available yet</p>
        <p className="mx-auto mt-1 max-w-sm text-ink-muted">{description}</p>
        <Link href="/today" className="mt-4 inline-block text-[13px] text-accent hover:underline">Back to Today</Link>
      </div>
    </>
  );
}
