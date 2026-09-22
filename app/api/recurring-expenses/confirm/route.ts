import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** The confirmation-dialog action: `log: true` logs today's payment (via the same
 *  log_expense() every other expense goes through) and advances the schedule; `log: false`
 *  just advances the schedule without logging anything — "skip this occurrence". Either way
 *  the next due date moves forward from migration 0012's confirm_recurring_expense(). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id, log } = (await req.json().catch(() => ({}))) as { id?: string; log?: boolean };
  if (!id || typeof log !== "boolean") return NextResponse.json({ error: "id and log are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_recurring_expense", {
    p_id: id,
    p_restaurant_id: session.restaurantId,
    p_log: log,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ success: true, nextDueDate: result.next_due_date, logged: result.logged });
}
