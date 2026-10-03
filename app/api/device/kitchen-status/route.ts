import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth/require-device";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["New", "Preparing", "Completed"];

/** Ticket Rail moves made on the desktop while it was offline, uploaded by the sync (device token
 *  only — there is no cashier session during a background sync). Same effect as POST
 *  /api/sales/kitchen-status: it only touches sales.kitchen_status of this restaurant's sales.
 *  Ops are applied in the order sent, so the last move of a ticket wins. */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { ops?: { opId?: string | number; saleId?: string; kitchenStatus?: string }[] };
  const ops = body.ops;
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 200) {
    return NextResponse.json({ error: "Send between 1 and 200 ops" }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: { opId: string | number | undefined; ok: boolean; error?: string }[] = [];
  for (const op of ops) {
    if (!op.saleId || !op.kitchenStatus || !STATUSES.includes(op.kitchenStatus)) {
      results.push({ opId: op.opId, ok: false, error: "saleId and a valid kitchenStatus are required" });
      continue;
    }
    const { error } = await admin
      .from("sales")
      .update({ kitchen_status: op.kitchenStatus })
      .eq("id", op.saleId)
      .eq("restaurant_id", auth.device.restaurantId);
    results.push(error ? { opId: op.opId, ok: false, error: error.message } : { opId: op.opId, ok: true });
  }
  return NextResponse.json({ results });
}
