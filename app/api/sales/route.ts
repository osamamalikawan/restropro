import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

// NOTE: the order-edit handler that used to live in this file is in app/api/sales/edit/route.ts
// (that's where components/edit-order-modal.tsx posts to).

/** Sales list — used by Sales, Unpaid Orders, Ticket Rail, Customers, Employees and Dashboard. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 100) || 100, 1000);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sales")
    .select("*, customers(name, phone), tables(number), sale_items(*), sale_payments(*)")
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: data });
}

/** POS checkout — the atomic create_sale() Postgres function (stock, payments, customer
 *  auto-create and the accounts entry all happen in one transaction). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "pos"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    orderType?: string;
    items?: { productId: string; name: string; price: number; qty: number }[];
    payments?: { method: string; amount: number }[];
    taxMethod?: string;
    tableId?: string | null;
    areaId?: string | null;
    deliveryCharge?: number;
    customerId?: string | null;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
  };
  if (!b.items || b.items.length === 0) {
    return NextResponse.json({ error: "Order must have at least one item" }, { status: 400 });
  }
  if (!["dine_in", "takeaway", "delivery"].includes(b.orderType ?? "")) {
    return NextResponse.json({ error: "Invalid order type" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The tax rate is read here, not trusted from the browser. Cash vs card follows the payment
  // method that carries the most money (or the method selected, when nothing is paid yet).
  const { data: st } = await admin
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .single();
  const payments = b.payments ?? [];
  const method = [...payments].sort((a, c) => c.amount - a.amount)[0]?.method ?? b.taxMethod ?? "Cash";
  const legacy = st?.tax_rate != null ? Number(st.tax_rate) : 5;
  const pct = /cash/i.test(method)
    ? st?.cash_tax_rate != null ? Number(st.cash_tax_rate) : legacy
    : st?.card_tax_rate != null ? Number(st.card_tax_rate) : legacy;

  const { data, error } = await admin.rpc("create_sale", {
    p_restaurant_id: session.restaurantId,
    p_cashier_employee_id: session.employeeId,
    p_order_type: b.orderType,
    p_items: b.items,
    p_payments: payments,
    p_tax_rate: pct / 100,
    p_table_id: b.tableId || null,
    p_area_id: b.areaId || null,
    p_delivery_charge: b.orderType === "delivery" ? b.deliveryCharge ?? 0 : 0,
    p_customer_id: b.customerId || null,
    p_customer_name: b.customerName || null,
    p_customer_phone: b.customerPhone || null,
    p_customer_address: b.customerAddress || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    orderNo: r.order_no,
    total: r.total,
    status: r.status,
    balance: r.balance ?? 0,
  });
}
