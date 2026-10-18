import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";

export async function GET() {
  const { user, response } = await guardApi();
  if (response) return response;
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
