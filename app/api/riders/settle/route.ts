import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { dueOf, isMissingRiderColumn, RIDER_MIGRATION_WARNING, round2 } from "@/lib/riders";

/** End of a rider's shift: they hand in the money for everything assigned to them that is not yet submitted.
 *  Body: { riderId, submittedAmount, note? }.
 *  - One rider_settlements row records orders, expected cash (the unpaid part of those orders), what was handed in and
 *    the difference (negative = short).
 *  - The handed-in cash is applied to the unpaid orders, oldest first, as Cash payments (through collect_sale_payment,
 *    so statuses and Accounts stay right). If the rider is short, the newest orders stay unpaid.
 *  - Every order in the batch is stamped with the settlement, so it is never counted again. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { riderId?: string; submittedAmount?: number; note?: string };
  const submitted = Number(b.submittedAmount);
  if (!b.riderId) return NextResponse.json({ error: "riderId is required" }, { status: 400 });
  if (!Number.isFinite(submitted) || submitted < 0 || submitted > 100_000_000) return NextResponse.json({ error: "Enter the amount the rider handed in" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rider, error: rErr } = await admin
    .from("employees")
    .select("id, name, is_rider")
    .eq("id", b.riderId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (rErr) return NextResponse.json({ error: isMissingRiderColumn(rErr) ? RIDER_MIGRATION_WARNING : rErr.message }, { status: 500 });
  if (!rider?.is_rider) return NextResponse.json({ error: "That person is not a delivery rider" }, { status: 400 });

  const { data: orders, error: oErr } = await admin
    .from("sales")
    .select("id, total, status, created_at, sale_payments(amount)")
    .eq("restaurant_id", session.restaurantId)
    .eq("rider_employee_id", b.riderId)
    .is("rider_settlement_id", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (oErr) return NextResponse.json({ error: isMissingRiderColumn(oErr) ? RIDER_MIGRATION_WARNING : oErr.message }, { status: 500 });
  const list = (orders ?? []) as unknown as { id: string; total: number; status: string; sale_payments: { amount: number }[] }[];
  if (!list.length) return NextResponse.json({ error: "This rider has no orders waiting to be submitted" }, { status: 400 });

  const ordersAmount = list.reduce((t, s) => t + (Number(s.total) || 0), 0);
  const expected = list.reduce((t, s) => t + dueOf(s), 0);

  const { data: me } = await admin.from("employees").select("name").eq("id", session.employeeId).maybeSingle();
  const { data: settlement, error: sErr } = await admin
    .from("rider_settlements")
    .insert({
      restaurant_id: session.restaurantId,
      rider_employee_id: b.riderId,
      rider_name: rider.name,
      orders_count: list.length,
      orders_amount: round2(ordersAmount),
      expected_amount: round2(expected),
      submitted_amount: round2(submitted),
      difference: round2(submitted - expected),
      note: b.note?.trim() ? b.note.trim().slice(0, 300) : null,
      received_by_employee_id: session.employeeId,
      received_by_name: me?.name ?? null,
    })
    .select("*")
    .single();
  if (sErr) return NextResponse.json({ error: isMissingRiderColumn(sErr) ? RIDER_MIGRATION_WARNING : sErr.message }, { status: 500 });

  // apply the cash that was handed in to the unpaid orders, oldest first
  let remaining = round2(submitted);
  const failed: string[] = [];
  let applied = 0;
  for (const s of list) {
    const due = round2(dueOf(s));
    if (due <= 0 || remaining <= 0) continue;
    const pay = round2(Math.min(due, remaining));
    const { error: pErr } = await admin.rpc("collect_sale_payment", { p_sale_id: s.id, p_restaurant_id: session.restaurantId, p_method: "Cash", p_amount: pay });
    if (pErr) failed.push(`${s.id}: ${pErr.message}`);
    else {
      remaining = round2(remaining - pay);
      applied = round2(applied + pay);
    }
  }

  const { error: uErr } = await admin.from("sales").update({ rider_settlement_id: settlement.id }).in("id", list.map((s) => s.id));
  if (uErr) return NextResponse.json({ error: `Saved the submission but could not mark the orders: ${uErr.message}`, settlement }, { status: 500 });

  return NextResponse.json({ success: true, settlement, applied, warnings: failed });
}
