import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

/** Adds a payment to an existing unpaid sale — see collect_sale_payment() in migration
 *  0010, which flips the sale to 'completed' once the balance reaches zero. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { saleId, method, amount } = (await req.json().catch(() => ({}))) as {
    saleId?: string;
    method?: string;
    amount?: number;
  };
  if (!saleId || !method || !amount || amount <= 0) {
    return NextResponse.json({ error: "saleId, method and a positive amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("collect_sale_payment", {
    p_sale_id: saleId,
    p_restaurant_id: session.restaurantId,
    p_method: method,
    p_amount: amount,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ success: true, status: result.new_status, balance: result.balance });
}
