import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** pay: true logs the payment (via the same log_supplier_payment() the ledger's own form
 *  uses) and marks the promise 'paid'. pay: false marks it 'cancelled' — a promise doesn't
 *  reschedule itself like a recurring expense does; it's resolved once. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id, pay, method } = (await req.json().catch(() => ({}))) as { id?: string; pay?: boolean; method?: string };
  if (!id || typeof pay !== "boolean") return NextResponse.json({ error: "id and pay are required" }, { status: 400 });
  if (pay && !method) return NextResponse.json({ error: "Select a payment method" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.rpc("confirm_promised_payment", {
    p_id: id,
    p_restaurant_id: session.restaurantId,
    p_pay: pay,
    p_method: method || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
