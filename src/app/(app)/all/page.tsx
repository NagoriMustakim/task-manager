import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/page-header";
import { TodoBoard } from "@/features/todos/components/todo-board";
import { listTodos } from "@/features/todos/queries";
import { STATUSES, STATUS_LABEL, type Status } from "@/features/todos/types";
import { requireUser } from "@/lib/auth/session";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "All tasks" };

export default async function AllPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const status = STATUSES.find((s) => s === sp.status);
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const today = getToday();
  const todos = await listTodos({ kind: "all", status, q }, user.id);

  const href = (s?: Status) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    return p.size ? `/all?${p}` : "/all";
  };
  const pill = "h-7 rounded-full border border-line-strong px-3 text-xs leading-7 hover:bg-line/50 aria-[current=true]:border-accent aria-[current=true]:font-medium aria-[current=true]:text-accent";
  return (
    <>
      <PageHeader title="All tasks" subtitle={`${todos.length} ${todos.length === 1 ? "task" : "tasks"}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/all" role="search" className="flex-1 basis-48">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} aria-label="Search tasks" placeholder="Search tasks…" maxLength={100} className="h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-sm" />
        </form>
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          <Link href={href()} aria-current={!status} className={pill}>All</Link>
          {STATUSES.map((s) => (<Link key={s} href={href(s)} aria-current={status === s} className={pill}>{STATUS_LABEL[s]}</Link>))}
        </nav>
      </div>
      <TodoBoard key={`${status ?? ""}|${q ?? ""}`} initial={todos} today={today} mode={{ kind: "all" }} emptyTitle={status || q ? "No tasks match" : "No tasks yet"} emptyHint={status || q ? "Clear the filters to see everything." : "Add your first task above."} />
    </>
  );
}
