import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/auth/pin";
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE,
} from "@/lib/auth/staff-session";
import { computeStatus, isUsable } from "@/lib/subscription";

/**
 * Employee PIN login — Step 2
 *
 * Body:
 * {
 *   restaurantId: string,
 *   employeeId: string,
 *   pin: string
 * }
 *
 * Step 1 (/login) already authenticated the restaurant using:
 *   restaurants.email + restaurants.password_hash
 *
 * Step 2 authenticates the selected employee using their PIN.
 *
 * The employee must belong to the restaurant resolved in Step 1.
 */
export async function POST(req: Request) {
  const { restaurantId, employeeId, pin } =
    (await req.json().catch(() => ({}))) as {
      restaurantId?: string;
      employeeId?: string;
      pin?: string;
    };

  if (!restaurantId || !employeeId || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      {
        error:
          "restaurantId, employeeId and a 4-digit pin are required",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  /*
   * Verify that the restaurant still exists and is active.
   *
   * We use the restaurantId established during Step 1.
   */
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id, status")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 }
    );
  }

  if (restaurant.status !== "active") {
    return NextResponse.json(
      {
        error: `This restaurant's account is ${restaurant.status}.`,
      },
      { status: 403 }
    );
  }

  /*
   * Verify subscription again.
   *
   * Never trust the restaurant status from Step 1 alone.
   */
  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sub) {
    const subscriptionStatus = computeStatus(sub);

    if (!isUsable(subscriptionStatus)) {
      return NextResponse.json(
        {
          error:
            "Subscription expired. Contact support to reactivate.",
        },
        { status: 402 }
      );
    }
  }

  /*
   * Find the selected employee.
   *
   * IMPORTANT:
   * restaurant_id is checked together with employee id.
   *
   * This prevents an employee belonging to Restaurant A from
   * being authenticated inside Restaurant B.
   */
  const { data: emp, error: employeeError } = await admin
    .from("employees")
    .select(
      "id, pin_hash, role, status, session_version"
    )
    .eq("id", employeeId)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (
    employeeError ||
    !emp ||
    emp.status !== "active"
  ) {
    return NextResponse.json(
      { error: "Employee not found or inactive" },
      { status: 401 }
    );
  }

  /*
   * Verify the employee PIN.
   */
  const validPin = await verifyPin(pin, emp.pin_hash);

  if (!validPin) {
    return NextResponse.json(
      { error: "Incorrect PIN — try again" },
      { status: 401 }
    );
  }

  /*
   * Create the actual staff session.
   *
   * From this point onward, the employee is authenticated.
   */
  const token = await createStaffSessionToken({
    restaurantId: restaurant.id,
    employeeId: emp.id,
    role: emp.role,
    sessionVersion: emp.session_version,
  });

  const res = NextResponse.json({
    success: true,
  });

  res.cookies.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return res;
}
