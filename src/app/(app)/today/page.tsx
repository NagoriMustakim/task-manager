import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/page-header";
import { DateNav } from "@/features/todos/components/date-nav";
import { TodoBoard } from "@/features/todos/components/todo-board";
import { listTodos } from "@/features/todos/queries";
import { requireUser } from "@/lib/auth/session";
import { formatLongDate, isIsoDate, relativeDateLabel } from "@/lib/dates";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ date: param }, user] = await Promise.all([searchParams, requireUser()]);
  const today = getToday();
  const date = isIsoDate(param) ? param : today;
  const [day, overdue] = await Promise.all([
    listTodos({ kind: "day", date }, user.id),
    date === today ? listTodos({ kind: "overdue", before: today }, user.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={relativeDateLabel(date, today)} subtitle={formatLongDate(date)} actions={<DateNav date={date} today={today} />} />
      <TodoBoard
        key={date}
        initial={[...overdue, ...day]}
        today={today}
        mode={{ kind: "day", date }}
        emptyTitle={date === today ? "Nothing planned for today" : "Nothing planned for this day"}
        emptyHint="Add a task above, or press N."
      />
    </>
  );
}
