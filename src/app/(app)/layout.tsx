import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/app-shell";
import { requireUser } from "@/lib/auth/session";

// Server-side gate for everything under (app): 401 when signed out (the proxy normally redirects to /login first).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell email={user.email}>{children}</AppShell>;
}
