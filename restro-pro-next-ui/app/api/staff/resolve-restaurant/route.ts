import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Step 1 of staff login, matching the old prototype's flow: the owner enters their real
 * email + password (their Supabase Auth credentials from signup) to verify it's really them
 * and resolve WHICH restaurant they belong to. This does NOT create a Supabase session cookie
 * for them — it's a one-off credential check, then the PIN step (step 2) takes over with its
 * own HMAC-signed cookie (see lib/auth/staff-session.ts). We deliberately don't persist a
 * Supabase Auth session on a shared till/terminal.
 */
export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // One-off client, no cookie persistence — just here to verify the password via Supabase Auth.
  const authClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.user) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("slug, name, status")
    .eq("owner_user_id", signInData.user.id)
    .single();

  if (!restaurant) return NextResponse.json({ error: "No restaurant is linked to this account" }, { status: 404 });
  if (restaurant.status !== "active") {
    return NextResponse.json({ error: `This restaurant's account is ${restaurant.status}.` }, { status: 403 });
  }

  return NextResponse.json({ slug: restaurant.slug, name: restaurant.name });
}
