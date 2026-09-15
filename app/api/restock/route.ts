import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stock_purchases")
    .select("id, quantity, unit_cost, total_cost, purchased_at, inventory_items(name, unit), suppliers(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("purchased_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data });
}

/** Logs a purchase via the atomic `log_restock` Postgres function (adds to inventory stock,
 *  updates unit cost, and books an accounts expense entry — all in one transaction, same
 *  rationale as create_sale() in app/api/sales/route.ts). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!["admin", "manager", "inventory"].includes(session.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { inventoryItemId, supplierId, quantity, unitCost } = (await req.json().catch(() => ({}))) as {
    inventoryItemId?: string;
    supplierId?: string | null;
    quantity?: number;
    unitCost?: number;
  };
  if (!inventoryItemId || !quantity || unitCost === undefined) {
    return NextResponse.json({ error: "inventoryItemId, quantity, and unitCost are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_restock", {
    p_restaurant_id: session.restaurantId,
    p_inventory_item_id: inventoryItemId,
    p_supplier_id: supplierId || null,
    p_quantity: quantity,
    p_unit_cost: unitCost,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
