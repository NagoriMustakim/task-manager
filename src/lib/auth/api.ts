import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";

type Guard = { user: SessionUser; response?: never } | { user?: never; response: NextResponse };

/** Route-handler guard: JSON 401 when signed out, JSON 403 when role is insufficient. */
export async function guardApi(requiredRole?: "admin"): Promise<Guard> {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (requiredRole && user.role !== requiredRole) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}
