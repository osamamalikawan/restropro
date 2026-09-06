import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/auth/pin";
import { createStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { computeStatus, isUsable } from "@/lib/subscription";

/**
 * Staff PIN login. Body: { restaurantSlug: string, pin: string }.
 * Resolves the tenant by slug (not by listing employees publicly — see ARCHITECTURE.md),
 * checks restaurant status + subscription grace/expiry, then bcrypt-compares the PIN against
 * every active employee in that tenant (fine at small-team scale; index by a PIN-lookup table
 * if you ever need this to scale past a few dozen staff per tenant).
 */
export async function POST(req: Request) {
  const { restaurantSlug, pin } = (await req.json().catch(() => ({}))) as {
    restaurantSlug?: string;
    pin?: string;
  };
  if (!restaurantSlug || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "restaurantSlug and a 4-digit pin are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, status")
    .eq("slug", restaurantSlug)
    .single();
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
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
  if (sub) {
    const status = computeStatus(sub);
    if (!isUsable(status)) {
      return NextResponse.json({ error: "Subscription expired. Contact support to reactivate." }, { status: 402 });
    }
  }

  const { data: employees } = await admin
    .from("employees")
    .select("id, pin_hash, role, status, session_version")
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active");

  for (const emp of employees ?? []) {
    if (await verifyPin(pin, emp.pin_hash)) {
      const token = await createStaffSessionToken({
        restaurantId: restaurant.id,
        employeeId: emp.id,
        role: emp.role,
        sessionVersion: emp.session_version,
      });
      const res = NextResponse.json({ success: true });
      res.cookies.set(STAFF_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return res;
    }
  }
  return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
}
