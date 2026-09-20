import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 20);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sales")
    .select(
      "id, order_no, order_type, subtotal, tax, total, delivery_charge, status, kitchen_status, created_at, customers(name, phone), tables(number), sale_items(name, unit_price, quantity), sale_payments(method, amount)"
    )
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: data });
}

/**
 * POS checkout. Body: { orderType, items: [{ productId, name, price, qty }],
 * payments: [{ method, amount }], tableId?, areaId?, deliveryCharge? }.
 *
 * Delegates the entire operation to the `create_sale` Postgres function
 * (supabase/migrations/0003_atomic_ops_and_suppliers.sql, extended in
 * 0004_settings_tables_delivery.sql) via `.rpc()` so that inserting the sale, its line items
 * and payments, deducting recipe-linked inventory, and booking the accounts entry all happen
 * in ONE database transaction — either it all commits or none of it does.
 *
 * Tax rate is read from restaurant_settings (falls back to 5% if the tenant somehow doesn't
 * have a settings row yet — see app/api/settings/route.ts, which auto-creates one on first GET).
 */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    orderType?: "dine_in" | "takeaway" | "delivery";
    items?: { productId: string; name: string; price: number; qty: number }[];
    payments?: { method: string; amount: number }[];
    tableId?: string | null;
    areaId?: string | null;
    deliveryCharge?: number;
    customerId?: string | null;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
  };
  const { orderType = "takeaway", items, payments, tableId, areaId, deliveryCharge, customerId, customerName, customerPhone, customerAddress } = body;
  if (!items || items.length === 0) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  if (orderType === "dine_in" && !tableId) return NextResponse.json({ error: "Select a table first" }, { status: 400 });

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("restaurant_settings")
    .select("tax_rate")
    .eq("restaurant_id", session.restaurantId)
    .single();
  const taxRate = settings ? Number(settings.tax_rate) / 100 : 0.05;

  const { data, error } = await admin.rpc("create_sale", {
    p_restaurant_id: session.restaurantId,
    p_cashier_employee_id: session.employeeId,
    p_order_type: orderType,
    p_items: items,
    p_payments: payments ?? [],
    p_tax_rate: taxRate,
    p_table_id: tableId || null,
    p_area_id: areaId || null,
    p_delivery_charge: orderType === "delivery" ? deliveryCharge || 0 : 0,
    p_customer_id: customerId || null,
    p_customer_name: customerName || null,
    p_customer_phone: customerPhone || null,
    p_customer_address: customerAddress || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    orderNo: result.order_no,
    total: result.total,
    status: result.status,
    balance: result.balance,
  });
}
