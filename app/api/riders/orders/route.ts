import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { dueOf, isMissingRiderColumn, RIDER_MIGRATION_WARNING, round2 } from "@/lib/riders";

const COLS = "id, order_no, display_id, created_at, total, status, order_type, kitchen_status, rider_employee_id, rider_assigned_at, rider_settlement_id, customers(name, phone, address), sale_payments(method, amount)";

/** Delivery orders assigned to riders, newest first, paged (?limit default 50 max 200, &offset).
 *  ?riderId= one rider (omit for all), ?status=pending|submitted (omit for both), ?from= & ?to= ISO instants on order time.
 *  First page also returns { totals: { orders, amount, due } } for the whole filter. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const admin = createAdminClient();

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const riderId = sp.get("riderId");
  const status = sp.get("status");
  const iso = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
  const from = iso(sp.get("from"));
  const to = iso(sp.get("to"));

  const build = (columns: string) => {
    let q = admin.from("sales").select(columns).eq("restaurant_id", session.restaurantId).neq("status", "cancelled");
    q = riderId ? q.eq("rider_employee_id", riderId) : q.not("rider_employee_id", "is", null);
    if (status === "pending") q = q.is("rider_settlement_id", null);
    if (status === "submitted") q = q.not("rider_settlement_id", "is", null);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return q;
  };

  const { data, error } = await build(COLS).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
  if (error) return NextResponse.json({ error: isMissingRiderColumn(error) ? RIDER_MIGRATION_WARNING : error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const body: Record<string, unknown> = { orders: rows.slice(0, limit), hasMore: rows.length > limit };

  if (offset === 0) {
    let orders = 0;
    let amount = 0;
    let due = 0;
    for (let start = 0, i = 0; i < 30; i++, start += 1000) {
      const { data: part, error: e2 } = await build("total, status, rider_settlement_id, sale_payments(amount)").order("id", { ascending: true }).range(start, start + 999);
      if (e2) break;
      for (const s of (part ?? []) as unknown as { total: number; status: string; rider_settlement_id: string | null; sale_payments: { amount: number }[] }[]) {
        orders += 1;
        amount += Number(s.total) || 0;
        if (!s.rider_settlement_id) due += dueOf(s);
      }
      if ((part ?? []).length < 1000) break;
    }
    body.totals = { orders, amount: round2(amount), due: round2(due) };
  }
  return NextResponse.json(body);
}
