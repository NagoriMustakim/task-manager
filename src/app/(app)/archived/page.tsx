import type { Metadata } from "next";
import { ArchivedList, type ArchivedTask } from "@/features/tasks/components/archived-list";
import { PageHeader } from "@/features/tasks/components/page-header";
import { listCategories } from "@/features/tasks/queries";
import { currentUserId } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Archived" };
export const dynamic = "force-dynamic";

export default async function ArchivedPage() {
  const uid = await currentUserId();
  const supabase = await createClient();
  const [{ data, error }, categories] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, priority, category_id, archived_at, recurrence_rule")
      .eq("user_id", uid)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(300),
    listCategories(),
  ]);
  if (error) throw new Error("Could not load archived tasks.");
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const tasks: ArchivedTask[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    archivedAt: t.archived_at ?? "",
    category: t.category_id ? (names.get(t.category_id) ?? null) : null,
    repeats: Boolean(t.recurrence_rule),
  }));
  return (
    <>
      <PageHeader title="Archived" subtitle={`${tasks.length} archived ${tasks.length === 1 ? "task" : "tasks"}`} />
      <ArchivedList initial={tasks} />
    </>
  );
}
