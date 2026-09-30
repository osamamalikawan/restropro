import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

/** See edit_sale() migration — restores stock for the original line items, applies the new
 *  item list, deducts stock again, and recomputes subtotal/tax/total + the linked accounts
 *  row, mirroring the prototype's openEditOrder()/saveOrderEdit(). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    saleId?: string;
    items?: { productId: string; name: string; price: number; qty: number }[];
    deliveryCharge?: number;
  };
  const { saleId, items, deliveryCharge } = body;
  if (!saleId) return NextResponse.json({ error: "saleId is required" }, { status: 400 });
  if (!items || items.length === 0) return NextResponse.json({ error: "Order must have at least one item" }, { status: 400 });

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("restaurant_settings")
    .select("tax_rate")
    .eq("restaurant_id", session.restaurantId)
    .single();
  const taxRate = settings ? Number(settings.tax_rate) / 100 : 0.05;

  const { data, error } = await admin.rpc("edit_sale", {
    p_sale_id: saleId,
    p_restaurant_id: session.restaurantId,
    p_items: items,
    p_tax_rate: taxRate,
    p_delivery_charge: deliveryCharge ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, sale: data?.[0] ?? null });
}
