import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/auth/pin";

/** Server-side proxy for the employees list — see lib/auth/require-staff.ts and
 *  ARCHITECTURE.md for why staff-authenticated tenant data never talks to Supabase directly
 *  from the browser (RLS only allows Super Admin on this table). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employees")
    .select("id, restaurant_id, name, role, status, updated_at")
    .eq("restaurant_id", session.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ employees: data });
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
  } else if (op === "insert") {
    return NextResponse.json({ error: "A 4-digit PIN is required for a new employee" }, { status: 400 });
  }

  const { error } = await admin.from("employees").upsert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
