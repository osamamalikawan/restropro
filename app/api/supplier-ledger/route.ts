import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const supplierId = url.searchParams.get("supplierId");
  const admin = createAdminClient();
  let query = admin
    .from("supplier_ledger")
    .select("id, supplier_id, amount, method, note, txn_date, suppliers(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("txn_date", { ascending: false })
    .limit(limit);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

/** Logs a payment via the atomic `log_supplier_payment` Postgres function — writes the
 *  ledger row and books the matching accounts expense entry in one transaction. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { supplierId, amount, method, note } = (await req.json().catch(() => ({}))) as {
    supplierId?: string;
    amount?: number;
    method?: string;
    note?: string;
  };
  if (!supplierId || !amount) {
    return NextResponse.json({ error: "supplierId and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_supplier_payment", {
    p_restaurant_id: session.restaurantId,
    p_supplier_id: supplierId,
    p_amount: amount,
    p_method: method || "Cash",
    p_note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
