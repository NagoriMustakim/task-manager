import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const { response } = await guardApi("admin");
  if (response) return response;
  const supabase = await createClient();
  const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  return NextResponse.json({ visibleUsers: count ?? 0 });
}
