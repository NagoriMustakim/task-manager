"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import { IconMenu, IconPlus } from "@/features/tasks/components/icons";
import { ToastProvider } from "@/features/tasks/components/toast";
import { ActiveTimerBar } from "@/features/time/active-timer-bar";
import type { ActiveTimer } from "@/features/time/queries";
import { TimerProvider } from "@/features/time/timer-context";
import { requestNewTask } from "@/lib/new-task";
import { NotificationBell } from "@/features/reminders/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Button from "@mui/material/Button";
import { GlobalShortcuts } from "./command-palette";
import { ADMIN_NAV, NAV } from "./nav";

interface ShellUser { email: string | null; displayName: string | null; role: "user" | "admin" }

export function AppShell({ user, timer, children }: { user: ShellUser; timer: { active: ActiveTimer | null; serverNow: string; timezone: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const items = [...NAV, ...(user.role === "admin" ? [ADMIN_NAV] : [])];
  // The most specific matching item wins (so /review/week doesn't also light up /review).
  const active = (href: string) =>
    pathname === href ||
    (pathname.startsWith(`${href}/`) && !items.some((o) => o.href !== href && o.href.startsWith(`${href}/`) && (pathname === o.href || pathname.startsWith(`${o.href}/`))));
  useEffect(() => setMore(false), [pathname]);

  return (
    <ToastProvider>
      <TimerProvider initial={timer.active} serverNow={timer.serverNow} timezone={timer.timezone}>
      <div className="min-h-dvh overflow-x-hidden md:flex">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>

        {/* Tablet: icon rail. Desktop: labelled sidebar. */}
        <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-14 lg:w-56">
          <div className="flex h-12 items-center gap-2 px-4 md:justify-center lg:justify-start">
            <span aria-hidden className="size-5 rounded-md bg-accent" />
            <span className="hidden font-semibold lg:inline">Tracker</span>
          </div>
          <div className="px-2 pb-2">
            <Button
              onClick={() => requestNewTask((h) => router.push(h))}
              variant="outlined"
              color="inherit"
              fullWidth
              size="small"
              aria-label="New task"
              startIcon={<IconPlus />}
              sx={{ justifyContent: { md: "center", lg: "flex-start" }, borderColor: "divider", minWidth: 0, "& .MuiButton-startIcon": { mr: { md: 0, lg: 1 }, ml: 0 } }}
            >
              <span className="hidden lg:inline">New task</span>
              <kbd className="ml-auto hidden text-[11px] text-ink-muted lg:inline">N</kbd>
            </Button>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                title={label}
                className="flex h-8 items-center gap-2.5 rounded-control px-2 text-[13px] text-ink-muted hover:bg-canvas hover:text-ink aria-[current=page]:bg-accent/10 aria-[current=page]:font-medium aria-[current=page]:text-accent md:justify-center lg:justify-start"
              >
                <Icon />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-line p-2">
            <p className="hidden truncate px-2 pb-1 text-xs text-ink-muted lg:block" title={user.email ?? ""}>{user.email}</p>
            <form action={signOutAction}>
              <button className="h-8 w-full rounded-control px-2 text-left text-[13px] text-ink-muted hover:bg-canvas md:text-center lg:text-left" aria-label="Sign out">
                <span className="lg:hidden">⏻</span><span className="hidden lg:inline">Sign out</span>
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: always top-right on laptops and large screens (and on phones). */}
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur md:justify-end md:px-8">
            <span className="flex items-center gap-2 font-semibold md:hidden"><span aria-hidden className="size-5 rounded-md bg-accent" />Tracker</span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">
            <div className="mx-auto max-w-4xl">{children}</div>
          </main>
        </div>

        {/* Mobile: bottom tab bar + FAB + menu sheet */}
        <button
          onClick={() => requestNewTask((h) => router.push(h))}
          aria-label="New task"
          className="fixed bottom-[4.5rem] right-4 z-30 flex size-12 items-center justify-center rounded-full bg-accent text-canvas shadow-lg active:bg-accent-hover md:hidden"
        >
          <IconPlus width={20} height={20} />
        </button>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.filter((n) => "primary" in n).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-muted aria-[current=page]:text-accent">
              <Icon width={20} height={20} />{label}
            </Link>
          ))}
          <button onClick={() => setMore(true)} aria-haspopup="dialog" className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-muted">
            <IconMenu width={20} height={20} />Menu
          </button>
        </nav>
        {more ? <MoreSheet items={items} active={active} user={user} onClose={() => setMore(false)} /> : null}

        <ActiveTimerBar />
        <GlobalShortcuts isAdmin={user.role === "admin"} />
      </div>
      </TimerProvider>
    </ToastProvider>
  );
}

function MoreSheet({ items, active, user, onClose }: { items: typeof NAV[number][] | (typeof NAV[number] | typeof ADMIN_NAV)[]; active: (h: string) => boolean; user: ShellUser; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div ref={ref} className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="truncate px-3 pb-2 pt-1 text-xs text-ink-muted">{user.email}</p>
        <ul>
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined} className="flex h-12 items-center gap-3 rounded-control px-3 text-sm aria-[current=page]:bg-canvas aria-[current=page]:font-medium">
                <Icon width={18} height={18} />{label}
              </Link>
            </li>
          ))}
        </ul>
        <form action={signOutAction} className="mt-1 border-t border-line pt-1">
          <button className="h-12 w-full rounded-control px-3 text-left text-sm text-ink-muted">Sign out</button>
        </form>
        <button onClick={onClose} className="mt-1 h-12 w-full rounded-control px-3 text-left text-sm text-ink-muted">Close</button>
      </div>
    </div>
  );
}
