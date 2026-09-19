import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/auth/password";
import { computeStatus, isUsable } from "@/lib/subscription";

/**
 * Step 1 of staff login: the owner enters their real email + password to verify it's really
 * them and resolve WHICH restaurant they belong to. This does NOT create a Supabase session
 * cookie for them — it's a one-off credential check, then the PIN step (step 2) takes over
 * with its own HMAC-signed cookie (see lib/auth/staff-session.ts).
 *
 * Primary path: bcrypt-verify against `restaurants.password_hash` (see app/signup/actions.ts,
 * which hashes and stores it at signup — no extra Supabase Auth round trip needed day to day).
 *
 * Fallback path: a restaurant that signed up BEFORE migration 0008 added password_hash has
 * `password_hash IS NULL` but does have a working Supabase Auth user (`owner_user_id`) — for
 * those, fall back to verifying via Supabase Auth directly, so existing accounts don't get
 * locked out. Once that owner logs in successfully this way, their password is copied into
 * `password_hash` so subsequent logins use the primary path.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const admin = createAdminClient();
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, slug, name, owner_user_id, password_hash, status")
      .eq("email", normalizedEmail)
      .single();

    if (!restaurant) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    let validPassword = false;

    if (restaurant.password_hash) {
      validPassword = await verifyPassword(password, restaurant.password_hash);
    } else if (restaurant.owner_user_id) {
      // Backward-compat path for restaurants that signed up before password_hash existed.
      const authClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      validPassword = !signInError && !!signInData.user;

      // Backfill password_hash so future logins use the fast bcrypt path instead of a
      // Supabase Auth round trip every time.
      if (validPassword) {
        const { hashPassword } = await import("@/lib/auth/password");
        await admin.from("restaurants").update({ password_hash: await hashPassword(password) }).eq("id", restaurant.id);
      }
    }

    if (!validPassword) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }
    if (restaurant.status !== "active") {
      return NextResponse.json({ error: `This restaurant's account is ${restaurant.status}.` }, { status: 403 });
    }

    const { data: sub } = await admin
      .from("subscriptions")
      .select("current_period_end, grace_until, status")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sub && !isUsable(computeStatus(sub))) {
      return NextResponse.json({ error: "Subscription expired. Contact support to reactivate." }, { status: 402 });
    }

    return NextResponse.json({ slug: restaurant.slug, name: restaurant.name });
  } catch (err) {
    console.error("Restaurant login error:", err);
    return NextResponse.json({ error: "Something went wrong while signing in." }, { status: 500 });
  }
}
