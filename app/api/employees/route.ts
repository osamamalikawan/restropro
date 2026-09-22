import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/auth/pin";

const MANAGER_ROLES = ["admin", "manager"];

/** Server-side proxy for the employees list — see lib/auth/require-staff.ts and
 *  ARCHITECTURE.md for why staff-authenticated tenant data never talks to Supabase directly
 *  from the browser (RLS only allows Super Admin on this table).
 *
 *  Every employee is a roster entry; only some are also "Users" — the ones who can actually
 *  sign in. That's driven entirely by whether pin_hash is set, so we derive `is_user` from it
 *  here and never send the hash itself back to the client. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employees")
    .select(
      "id, restaurant_id, name, role, status, father_name, cnic_number, address, joining_date, salary_amount, left_date, pin_hash, updated_at"
    )
    .eq("restaurant_id", session.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const employees = (data ?? []).map(({ pin_hash, ...rest }) => ({ ...rest, is_user: pin_hash != null }));
  return NextResponse.json({ employees });
}

/**
 * Write path — also backs the Users & Permissions page (create a User from an active
 * employee, revoke a User's login access). Admin AND Manager can manage employees/users;
 * everyone else is blocked here even if they somehow reach the page.
 *
 * `row.pin` (plain 4-digit string) is accepted on insert/update and hashed server-side via
 * hashPin() — the plain PIN never gets persisted or sent back to any client after this call.
 *
 * Ops:
 *  - insert / update: upsert the roster row. Omitting `pin` leaves login access untouched
 *    (adding an employee with no pin = roster-only, not a User yet).
 *  - markLeft: soft-delete — never removes the row. Sets status='left', left_date=today, and
 *    clears any PIN (disables their login immediately, per the employees.session_version bump
 *    below) while keeping every other field for historical/payroll records.
 *  - revokeUser: keeps the employee on the roster (status untouched) but clears their PIN —
 *    used from Users & Permissions to remove someone's login access without marking them left.
 */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Only Admin or Manager can manage employees" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });
  if (op !== "insert" && !row.id) return NextResponse.json({ error: "row.id is required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "markLeft") {
    // Bumping session_version invalidates any signed cookie they're currently holding —
    // same mechanism a PIN reset uses — so login access is disabled immediately, not just on
    // their next token expiry.
    const { data: current } = await admin.from("employees").select("session_version").eq("id", row.id).eq("restaurant_id", session.restaurantId).single();
    const { error } = await admin
      .from("employees")
      .update({
        status: "left",
        left_date: row.leftDate ?? new Date().toISOString().slice(0, 10),
        pin_hash: null,
        session_version: (current?.session_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "revokeUser") {
    const { data: current } = await admin.from("employees").select("session_version").eq("id", row.id).eq("restaurant_id", session.restaurantId).single();
    const { error } = await admin
      .from("employees")
      .update({ pin_hash: null, session_version: (current?.session_version ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Legacy alias some older client code may still send — same as markLeft.
  if (op === "delete") {
    const { error } = await admin
      .from("employees")
      .update({ status: "left", left_date: new Date().toISOString().slice(0, 10), pin_hash: null })
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { pin, ...rest } = row as { pin?: string; [k: string]: any };
  const payload: Record<string, any> = { ...rest, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };

  if (pin) {
    if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    payload.pin_hash = await hashPin(pin);
  }
  // No PIN on insert is valid — the employee is added to the roster but isn't a User yet
  // (can't sign in) until someone grants access with a PIN, either now or later, from Users &
  // Permissions.

  const { error } = await admin.from("employees").upsert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
