import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supplier_promised_payments")
    .select("id, supplier_id, amount, promised_date, note, status, suppliers(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("promised_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promises: data });
}

/** Admin/Manager only, same as logging a payment directly. Body: { op: "insert" | "update"
 *  | "delete", row: {...} }. Update is only meaningful while status='pending' — once
 *  resolved, use the confirm endpoint's history instead of editing the row. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: Record<string, unknown> };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "delete") {
    if (!row.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await admin.from("supplier_promised_payments").delete().eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "update") {
    if (!row.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { id, ...patch } = row;
    const { error } = await admin
      .from("supplier_promised_payments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", session.restaurantId)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // insert
  const { supplierId, amount, promisedDate, note } = row as {
    supplierId?: string;
    amount?: number;
    promisedDate?: string;
    note?: string;
  };
  if (!supplierId) return NextResponse.json({ error: "Select a supplier" }, { status: 400 });
  if (!amount || amount <= 0) return NextResponse.json({ error: "Enter a positive amount" }, { status: 400 });
  if (!promisedDate) return NextResponse.json({ error: "Set the promised payment date" }, { status: 400 });

  const { error } = await admin.from("supplier_promised_payments").insert({
    restaurant_id: session.restaurantId,
    supplier_id: supplierId,
    amount,
    promised_date: promisedDate,
    note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
