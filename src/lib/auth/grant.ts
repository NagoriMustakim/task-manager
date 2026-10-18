import "server-only";
import { createClient } from "@/lib/supabase/server";

/** True when `adminId` holds a read grant for `subjectId` (the row is only visible to that admin via RLS). */
export async function hasReadGrant(adminId: string, subjectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("admin_user_access").select("user_id").eq("admin_id", adminId).eq("user_id", subjectId).maybeSingle();
  return Boolean(data);
}
