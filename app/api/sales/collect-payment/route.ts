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

  const body = (await req.json().catch(() => ({}))) as {
    saleId?: string;
    method?: string;
    amount?: number;
    /** split payment: several methods for one balance, e.g. [{ method: "Cash", amount: 500 }, { method: "JazzCash", amount: 700 }] */
    payments?: { method?: string; amount?: number }[];
  };
  const { saleId } = body;
  const parts = Array.isArray(body.payments)
    ? body.payments.map((p) => ({ method: String(p.method ?? "").trim(), amount: Math.round((Number(p.amount) || 0) * 100) / 100 })).filter((p) => p.amount > 0)
    : body.method && body.amount && body.amount > 0
      ? [{ method: body.method, amount: body.amount }]
      : [];
  if (!saleId || parts.length === 0 || parts.some((p) => !p.method)) {
    return NextResponse.json({ error: "saleId and at least one payment (method and a positive amount) are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // a split must not collect more than is owed
  if (parts.length > 1) {
    const { data: sale } = await admin.from("sales").select("total, sale_payments(amount)").eq("id", saleId).eq("restaurant_id", session.restaurantId).maybeSingle();
    if (!sale) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const paid = ((sale as { sale_payments?: { amount: number }[] }).sale_payments ?? []).reduce((t, p) => t + Number(p.amount), 0);
    const balance = Math.max(Number((sale as { total: number }).total) - paid, 0);
    const entered = parts.reduce((t, p) => t + p.amount, 0);
    if (entered > balance + 0.005) return NextResponse.json({ error: `The payments add up to more than the balance (${balance})` }, { status: 400 });
  }

  let last: { new_status: string; balance: number } | null = null;
  const done: string[] = [];
  for (const p of parts) {
    const { data, error } = await admin.rpc("collect_sale_payment", {
      p_sale_id: saleId,
      p_restaurant_id: session.restaurantId,
      p_method: p.method,
      p_amount: p.amount,
    });
    if (error) {
      const partial = done.length ? ` (already recorded: ${done.join(", ")})` : "";
      return NextResponse.json({ error: `${error.message}${partial}` }, { status: 400 });
    }
    last = Array.isArray(data) ? data[0] : data;
    done.push(`${p.method} ${p.amount}`);
  }
  return NextResponse.json({ success: true, status: last?.new_status, balance: last?.balance });
}
