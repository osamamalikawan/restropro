import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_ledger")
    .select("id, type, amount, note, txn_date, employees(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("txn_date", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

/** Logs a payment via the atomic `log_employee_payment` Postgres function — writes the
 *  ledger row and books the matching accounts expense entry in one transaction. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { employeeId, type, amount, note } = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    type?: "salary" | "advance" | "bonus" | "deduction";
    amount?: number;
    note?: string;
  };
  if (!employeeId || !type || !amount) {
    return NextResponse.json({ error: "employeeId, type, and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_employee_payment", {
    p_restaurant_id: session.restaurantId,
    p_employee_id: employeeId,
    p_type: type,
    p_amount: amount,
    p_note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
