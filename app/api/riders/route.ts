import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { dueOf, isMissingRiderColumn, RIDER_MIGRATION_WARNING, round2 } from "@/lib/riders";

/** Delivery riders (employees marked "Delivery rider") with what each still has to hand in:
 *  pending_orders / pending_amount (value of orders assigned and not yet submitted) / pending_due (cash they owe). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const admin = createAdminClient();

  const { data: riders, error } = await admin
    .from("employees")
    .select("id, name, status")
    .eq("restaurant_id", session.restaurantId)
    .eq("is_rider", true)
    .neq("status", "left")
    .order("name");
  if (error) return NextResponse.json({ error: isMissingRiderColumn(error) ? RIDER_MIGRATION_WARNING : error.message }, { status: 500 });

  const stats = new Map<string, { pending_orders: number; pending_amount: number; pending_due: number }>();
  for (const r of riders ?? []) stats.set(r.id as string, { pending_orders: 0, pending_amount: 0, pending_due: 0 });

  for (let from = 0; ; from += 1000) {
    const { data, error: e2 } = await admin
      .from("sales")
      .select("rider_employee_id, total, status, sale_payments(amount)")
      .eq("restaurant_id", session.restaurantId)
      .not("rider_employee_id", "is", null)
      .is("rider_settlement_id", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (e2) return NextResponse.json({ error: isMissingRiderColumn(e2) ? RIDER_MIGRATION_WARNING : e2.message }, { status: 500 });
    for (const s of (data ?? []) as unknown as { rider_employee_id: string; total: number; status: string; sale_payments: { amount: number }[] }[]) {
      const st = stats.get(s.rider_employee_id);
      if (!st) continue;
      st.pending_orders += 1;
      st.pending_amount += Number(s.total) || 0;
      st.pending_due += dueOf(s);
    }
    if ((data?.length ?? 0) < 1000) break;
  }

  return NextResponse.json({
    riders: (riders ?? []).map((r) => {
      const st = stats.get(r.id as string)!;
      return { ...r, pending_orders: st.pending_orders, pending_amount: round2(st.pending_amount), pending_due: round2(st.pending_due) };
    }),
  });
}
