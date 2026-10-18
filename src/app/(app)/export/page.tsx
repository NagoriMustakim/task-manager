import type { Metadata } from "next";
import { ExportForm } from "@/features/exports/export-form";
import { PageHeader } from "@/features/tasks/components/page-header";
import { getUserSettings } from "@/features/tasks/queries";

export const metadata: Metadata = { title: "Export" };
export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const { today, timezone } = await getUserSettings();
  return (
    <>
      <PageHeader title="Export" subtitle={`CSV files of your own data · ${timezone}`} />
      <ExportForm today={today} />
    </>
  );
}
