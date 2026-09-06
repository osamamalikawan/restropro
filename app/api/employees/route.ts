import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side proxy for the employees list, used by the local-first sync engine
 * (lib/sync.ts) instead of querying Supabase directly from the browser. The `employees`
 * table's RLS intentionally has no policy for staff/owner browser access (see
 * ARCHITECTURE.md) — PIN-authenticated staff aren't Supabase Auth users, so a direct
 * browser query would silently return zero rows under RLS. This route verifies the signed
 * staff-session cookie, re-checks session_version + tenant status server-side, and only
 * then reads the data using the service-role client.
 */
export async function GET() {
  const token = cookies().get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id, status, session_version")
    .eq("id", session.employeeId)
    .single();
  if (!employee || employee.status !== "active" || employee.session_version !== session.sessionVersion) {
    return NextResponse.json({ error: "Session no longer valid" }, { status: 401 });
  }

  const { data, error } = await admin
    .from("employees")
    .select("id, restaurant_id, name, role, status, updated_at")
    .eq("restaurant_id", session.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ employees: data });
}

/** Write path counterpart for the sync engine's outbox flush. Nothing in the UI calls this
 *  yet (no employee create/edit screen is built in the Next.js app so far — see README's
 *  "porting the rest of the prototype" section) but it's wired up so flushOutbox() has a
 *  real, secure endpoint to land on the moment that UI exists, rather than a 404. */
export async function POST(req: Request) {
  const token = cookies().get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();
  const payload = { ...row, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };

  if (op === "delete") {
    const { error } = await admin.from("employees").update({ status: "inactive" }).eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("employees").upsert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
