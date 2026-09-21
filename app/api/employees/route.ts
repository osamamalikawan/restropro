import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/auth/pin";

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
    .select("id, restaurant_id, name, role, status, pin_hash, updated_at")
    .eq("restaurant_id", session.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const employees = (data ?? []).map(({ pin_hash, ...rest }) => ({ ...rest, is_user: pin_hash != null }));
  return NextResponse.json({ employees });
}

/**
 * Write path — also backs the Users & Permissions page (add employee / change role /
 * deactivate), not just the sync engine's outbox flush. Admin-only: managing who can log in
 * and what they can do is exactly the kind of action that shouldn't be delegated to Manager.
 *
 * `row.pin` (plain 4-digit string) is accepted on insert and hashed server-side via
 * hashPin() — the plain PIN never gets persisted or sent back to any client after this call.
 */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Only Admin can manage employees" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "delete") {
    const { error } = await admin.from("employees").update({ status: "inactive" }).eq("id", row.id).eq("restaurant_id", session.restaurantId);
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
  // (can't sign in) until someone grants access with a PIN, either now or later.

  const { error } = await admin.from("employees").upsert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
