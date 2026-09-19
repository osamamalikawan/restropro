import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Production history — self-made batches logged via Restock. Read by both the Restock
 *  page's combined history table and Recipes & Production's "Production History" tab. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_logs")
    .select("id, quantity, cost_per_unit, total_cost, produced_at, inventory_items(name, unit), employees(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("produced_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ productions: data });
}

/** Logs a production batch via the atomic `log_production` Postgres function — consumes raw
 *  ingredients per recipe, adds the produced qty to stock, recomputes unit cost. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!["admin", "manager", "inventory"].includes(session.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { inventoryItemId, quantity } = (await req.json().catch(() => ({}))) as {
    inventoryItemId?: string;
    quantity?: number;
  };
  if (!inventoryItemId || !quantity) return NextResponse.json({ error: "inventoryItemId and quantity are required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_production", {
    p_restaurant_id: session.restaurantId,
    p_self_made_item_id: inventoryItemId,
    p_quantity: quantity,
    p_employee_id: session.employeeId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
