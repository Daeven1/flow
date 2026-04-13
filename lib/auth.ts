import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user's ID from the Supabase session.
 * Returns null if no valid session exists.
 * Use in API route handlers only (not server components).
 */
export async function getUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
