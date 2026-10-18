import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/app-shell";
import { getUserSettings } from "@/features/tasks/queries";
import { getActiveTimer } from "@/features/time/queries";
import { requireUser } from "@/lib/auth/session";

// Server-side gate for everything under (app): 401 when signed out (the proxy normally
// redirects to /login first), independent of UI navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [{ timer, serverNow }, { timezone }] = await Promise.all([getActiveTimer(), getUserSettings()]);
  return (
    <AppShell
      user={{ email: user.email, displayName: user.displayName, role: user.role }}
      timer={{ active: timer, serverNow, timezone }}
    >
      {children}
    </AppShell>
  );
}
