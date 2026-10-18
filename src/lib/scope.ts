import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Id of the signed-in user (verified with the Auth server). Every user-scoped query filters on
 * `user_id` explicitly: row-level security alone is not enough for administrators, whose policies
 * also allow reading other users' rows, so an unfiltered query would silently mix their data in.
 */
export const currentUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
});
