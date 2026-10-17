import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

/** New-order alerts: the orders placed after `?since=` (an ISO time returned by the previous call), newest last.
 *  Polled every few seconds by the app shell and the POS so a chime + banner can appear on whatever page is open -
 *  orders are often placed on other devices. Without `since` it only returns { now } (the starting point).
 *  `since` is never older than 10 minutes, so a long-closed tab doesn't replay old orders. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const now = new Date().toISOString();
  const raw = new URL(req.url).searchParams.get("since");
  if (!raw || !Number.isFinite(Date.parse(raw))) return NextResponse.json({ now, sales: [] });
  const since = new Date(Math.max(Date.parse(raw), Date.now() - 10 * 60_000)).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sales")
    .select("id, order_no, display_id, total, order_type, created_at, cashier_employee_id")
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "cancelled")
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((data ?? []).map((s) => s.cashier_employee_id as string | null).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: emps } = await admin.from("employees").select("id, name").in("id", ids);
    for (const e of emps ?? []) names.set(e.id as string, e.name as string);
  }
  return NextResponse.json({
    now,
    sales: (data ?? []).map((s) => ({
      id: s.id,
      order_no: s.order_no,
      display_id: s.display_id ?? null,
      total: Number(s.total) || 0,
      order_type: s.order_type,
      created_at: s.created_at,
      cashier: s.cashier_employee_id ? names.get(s.cashier_employee_id as string) ?? null : null,
    })),
  });
}
