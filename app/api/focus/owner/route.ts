import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** The Focus clock uses the same cookie and server-verified account as password sign-in. */
export async function GET() {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error) {
      const signedOut = error.name === "AuthSessionMissingError" ||
        error.status === 401 || error.status === 403 ||
        error.code === "session_not_found" || error.code === "refresh_token_not_found" ||
        error.code === "refresh_token_already_used" || error.code === "user_not_found" ||
        error.code === "bad_jwt";
      return new Response(null, { status: signedOut ? 401 : 503, headers });
    }
    return data.user?.id
      ? Response.json({ owner: data.user.id }, { headers })
      : new Response(null, { status: 401, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
