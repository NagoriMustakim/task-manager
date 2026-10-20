"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { signOutAction } from "@/features/auth/actions";
import { IconChart, IconList, IconToday, IconUpcoming } from "@/features/todos/components/icons";

const NAV = [
  { href: "/today", label: "Today", icon: IconToday },
  { href: "/upcoming", label: "Upcoming", icon: IconUpcoming },
  { href: "/all", label: "All tasks", icon: IconList },
  { href: "/analytics", label: "Analytics", icon: IconChart },
] as const;

export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-12 items-center gap-2 px-4"><span aria-hidden className="size-5 rounded-md bg-accent" /><span className="font-semibold">Tracker</span></div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 px-2 pt-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className="flex h-9 items-center gap-2.5 rounded-control px-2 text-[13px] text-ink-muted hover:bg-line/50 hover:text-ink aria-[current=page]:bg-accent/10 aria-[current=page]:font-medium aria-[current=page]:text-accent">
              <Icon />{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <p className="truncate px-2 pb-1 text-xs text-ink-muted" title={email ?? ""}>{email}</p>
          <form action={signOutAction}><button className="h-8 w-full rounded-control px-2 text-left text-[13px] text-ink-muted hover:bg-line/50">Sign out</button></form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur md:justify-end md:px-8">
          <span className="flex items-center gap-2 font-semibold md:hidden"><span aria-hidden className="size-5 rounded-md bg-accent" />Tracker</span>
          <ThemeToggle />
        </header>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          <div className="mx-auto max-w-3xl">{children}</div>
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-muted aria-[current=page]:text-accent">
            <Icon width={20} height={20} />{label}
          </Link>
        ))}
        <form action={signOutAction} className="contents"><button className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-muted">Sign out</button></form>
      </nav>
    </div>
  );
}
