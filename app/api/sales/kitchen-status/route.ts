import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

const STATUSES = ["New", "Preparing", "Completed"];

/** Ticket Rail's move-forward/move-back buttons — just updates sales.kitchen_status, which
 *  is entirely independent of payment status (see migration 0010). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "pos"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { saleId, kitchenStatus } = (await req.json().catch(() => ({}))) as { saleId?: string; kitchenStatus?: string };
  if (!saleId || !kitchenStatus || !STATUSES.includes(kitchenStatus)) {
    return NextResponse.json({ error: "saleId and a valid kitchenStatus are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sales")
    .update({ kitchen_status: kitchenStatus })
    .eq("id", saleId)
    .eq("restaurant_id", session.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
