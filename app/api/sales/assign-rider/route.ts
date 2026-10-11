import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { isMissingRiderColumn, RIDER_MIGRATION_WARNING } from "@/lib/riders";

/** Assign a delivery order to a rider (or take the rider off with riderId: null). Only delivery orders, and only
 *  until the rider has handed in the money for them. Body: { saleId, riderId | null }. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { saleId, riderId } = (await req.json().catch(() => ({}))) as { saleId?: string; riderId?: string | null };
  if (!saleId) return NextResponse.json({ error: "saleId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: sale, error } = await admin
    .from("sales")
    .select("id, order_type, status, rider_settlement_id")
    .eq("id", saleId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: isMissingRiderColumn(error) ? RIDER_MIGRATION_WARNING : error.message }, { status: 500 });
  if (!sale) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (sale.order_type !== "delivery") return NextResponse.json({ error: "Only delivery orders can be assigned to a rider" }, { status: 400 });
  if (sale.status === "cancelled") return NextResponse.json({ error: "This order is cancelled" }, { status: 400 });
  if (sale.rider_settlement_id) return NextResponse.json({ error: "The rider already handed in the money for this order" }, { status: 409 });

  if (riderId) {
    const { data: rider } = await admin
      .from("employees")
      .select("id, is_rider, status")
      .eq("id", riderId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle();
    if (!rider || !rider.is_rider || rider.status === "left") return NextResponse.json({ error: "That person is not an active delivery rider" }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from("sales")
    .update(riderId ? { rider_employee_id: riderId, rider_assigned_at: new Date().toISOString() } : { rider_employee_id: null, rider_assigned_at: null })
    .eq("id", saleId);
  if (upErr) return NextResponse.json({ error: isMissingRiderColumn(upErr) ? RIDER_MIGRATION_WARNING : upErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
