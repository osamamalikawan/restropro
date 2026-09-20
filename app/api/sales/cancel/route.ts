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

  const { saleId } = (await req.json().catch(() => ({}))) as { saleId?: string };
  if (!saleId) return NextResponse.json({ error: "saleId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.rpc("cancel_sale", { p_sale_id: saleId, p_restaurant_id: session.restaurantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
