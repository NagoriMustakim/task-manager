import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/page-header";
import { TodoBoard } from "@/features/todos/components/todo-board";
import { listTodos } from "@/features/todos/queries";
import { requireUser } from "@/lib/auth/session";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "Upcoming" };

export default async function UpcomingPage() {
  const user = await requireUser();
  const today = getToday();
  const todos = await listTodos({ kind: "upcoming", after: today }, user.id);
  return (
    <>
      <PageHeader title="Upcoming" subtitle="Everything planned after today" />
      <TodoBoard initial={todos} today={today} mode={{ kind: "upcoming" }} emptyTitle="Nothing planned ahead" emptyHint="Tasks you plan for future days show up here." />
    </>
  );
}
