import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

/** See cancel_sale() in migration 0010 — restores recipe-linked inventory and removes the
 *  linked accounts income entry, mirroring the prototype's cancelOrder(). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { saleId, note } = (await req.json().catch(() => ({}))) as { saleId?: string; note?: string };
  if (!saleId) return NextResponse.json({ error: "saleId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: sale } = await admin
    .from("sales")
    .select("id, status, kitchen_status")
    .eq("id", saleId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (!sale) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (sale.status === "cancelled") return NextResponse.json({ error: "This order is already cancelled" }, { status: 409 });

  // Where in the kitchen the order was when it was cancelled: Active (New), Preparing or Completed.
  const stage = sale.kitchen_status === "Completed" ? "completed" : sale.kitchen_status === "Preparing" ? "preparing" : "active";
  const reason = typeof note === "string" ? note.trim().slice(0, 300) : "";
  if (stage === "completed" && reason.length < 3) {
    return NextResponse.json({ error: "A note is required to cancel a completed order - say why it is being cancelled" }, { status: 400 });
  }

  const { error } = await admin.rpc("cancel_sale", { p_sale_id: saleId, p_restaurant_id: session.restaurantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // keep the stage, the reason and who cancelled it (columns come from migration 0026)
  const { data: me } = await admin.from("employees").select("name").eq("id", session.employeeId).maybeSingle();
  const { error: metaErr } = await admin
    .from("sales")
    .update({ cancelled_stage: stage, cancel_note: reason || null, cancelled_at: new Date().toISOString(), cancelled_by_name: me?.name ?? null })
    .eq("id", saleId);
  return NextResponse.json({ success: true, stage, warning: metaErr ? "Cancelled, but the reason was not saved - run migration 0026 in Supabase." : undefined });
}
