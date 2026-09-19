import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/auth/pin";
import { createStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { computeStatus, isUsable } from "@/lib/subscription";

/**
 * Staff PIN login. Body: { restaurantSlug: string, employeeId: string, pin: string }.
 * Matches the prototype's flow: the picker (step 2, /api/staff/employees) already told the
 * UI which employee this is, so the PIN only needs to be checked against that one row —
 * not iterated across the whole tenant. Still re-checks restaurant status + subscription
 * grace/expiry here (never trust step 2's response alone).
 */
export async function POST(req: Request) {
  const { restaurantSlug, employeeId, pin } = (await req.json().catch(() => ({}))) as {
    restaurantSlug?: string;
    employeeId?: string;
    pin?: string;
  };
  if (!restaurantSlug || !employeeId || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "restaurantSlug, employeeId and a 4-digit pin are required" }, { status: 400 });
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

  const { data: emp } = await admin
    .from("employees")
    .select("id, pin_hash, role, status, session_version")
    .eq("id", employeeId)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (!emp || emp.status !== "active" || !(await verifyPin(pin, emp.pin_hash))) {
    return NextResponse.json({ error: "Incorrect PIN — try again" }, { status: 401 });
  }

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
