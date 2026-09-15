import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server Component / Server Action Supabase client, bound to the request's auth cookies.
 *  Respects RLS as the calling user (owner or super admin). */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render (not an action/route) — safe to ignore,
            // middleware refreshes the session cookie on the next request instead.
          }
        },
      },
    }
  );
}
