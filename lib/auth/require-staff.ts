import { cookies, headers } from "next/headers";
import { requireDevice } from "./require-device";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE, type StaffSessionPayload } from "./staff-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, isUsable } from "@/lib/subscription";
import { getModuleAccess, type Role } from "@/lib/permissions";

/** A single .single() lookup, retried once on a transient error. Without this, a momentary
 *  network/DB hiccup (more likely to surface on pages that fire several parallel requests at
 *  once, like Employees) was silently treated the same as "this employee doesn't exist" and
 *  forced a full logout — even though the session and the row were both perfectly fine. */
async function queryWithRetry<T>(run: () => PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await run();
    if (!error) return data;
    if (attempt === 1) {
      console.error("requireStaffSession: DB lookup failed after retry", error);
      return null;
    }
  }
  return null;
}

/** Shared re-verification used by every staff-facing API route: checks the signed cookie,
 *  then re-checks employees.status + session_version server-side (so a PIN reset / forced
 *  logout / deactivation takes effect immediately even though the cookie itself is still
 *  validly signed). Returns null if anything doesn't check out — callers should respond 401. */
export async function requireStaffSession(): Promise<StaffSessionPayload | null> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) return requireDeviceStaffSession();

  const admin = createAdminClient();
  const employee = await queryWithRetry<{ status: string; session_version: number }>(() =>
    admin.from("employees").select("status, session_version").eq("id", session.employeeId).single()
  );
  if (!employee || employee.status !== "active" || employee.session_version !== session.sessionVersion) {
    return null;
  }
  return session;
}

/** Full page-level context: session + employee name/role + restaurant + subscription status.
 *  Used by app/(restaurant)/dashboard/layout.tsx (and app/pos/page.tsx) so this "who is this,
 *  are they allowed in" logic lives in exactly one place instead of being hand-copied into
 *  every page. Returns null if anything doesn't check out — callers should redirect("/login"). */
export async function resolveStaffContext() {
  const session = await requireStaffSession();
  if (!session) return null;

  const admin = createAdminClient();
  const employee = await queryWithRetry<{ id: string; name: string; role: string; status: string }>(() =>
    admin.from("employees").select("id, name, role, status").eq("id", session.employeeId).single()
  );
  if (!employee) return null;

  const restaurant = await queryWithRetry<{ id: string; name: string; status: string }>(() =>
    admin.from("restaurants").select("id, name, status").eq("id", session.restaurantId).single()
  );
  if (!restaurant || restaurant.status !== "active") return null;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const subStatus = sub ? computeStatus(sub) : ("expired" as const);
  if (sub && !isUsable(subStatus)) return null;

  const [modulePerms, { data: settings }] = await Promise.all([
    getModuleAccess(restaurant.id, employee.role as Role),
    admin.from("restaurant_settings").select("shift_start, shift_end").eq("restaurant_id", restaurant.id).single(),
  ]);

  return {
    session,
    employee: { ...employee, role: employee.role as Role },
    restaurant,
    subStatus,
    modulePerms,
    shift: settings ? { start: settings.shift_start as string, end: settings.shift_end as string } : null,
  };
}


/** Desktop app path: no browser cookie, so the app sends its activated-device token plus the id
 *  of the cashier signed in on that device (PIN checked on the device — see restropro-desk
 *  staff_auth.rs). The device is the trust anchor: the owner activated it, and the owner can
 *  revoke it (devices.revoked_at). The employee's role, status and the restaurant are still
 *  re-read from the database on every request, so permissions and deactivation take effect
 *  immediately, and an employee id from a different restaurant is rejected. */
async function requireDeviceStaffSession(): Promise<StaffSessionPayload | null> {
  const h = await headers();
  const staffId = h.get("x-staff-id");
  if (!staffId || !(h.get("authorization") ?? "").toLowerCase().startsWith("bearer ")) return null;

  const auth = await requireDevice(new Request("http://internal", { headers: { authorization: h.get("authorization")! } }));
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const employee = await queryWithRetry<{ id: string; role: string; status: string; session_version: number; restaurant_id: string }>(() =>
    admin.from("employees").select("id, role, status, session_version, restaurant_id").eq("id", staffId).single()
  );
  if (!employee || employee.status !== "active" || employee.restaurant_id !== auth.device.restaurantId) return null;

  const now = Date.now();
  return {
    restaurantId: employee.restaurant_id,
    employeeId: employee.id,
    role: employee.role,
    sessionVersion: employee.session_version,
    issuedAt: now,
    expiresAt: now + 60_000,
  };
}
