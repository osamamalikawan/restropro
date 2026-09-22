import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQUENCIES = ["daily", "weekly", "fortnightly", "monthly", "yearly"];

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recurring_expenses")
    .select("id, category, amount, vendor, description, payment_method, frequency, next_due_date, is_active")
    .eq("restaurant_id", session.restaurantId)
    .order("next_due_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurringExpenses: data });
}

/** Admin/Manager only, same as regular expense entries. Body: { op: "insert" | "update" |
 *  "delete", row: {...} }. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: Record<string, unknown> };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "delete") {
    if (!row.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await admin.from("recurring_expenses").delete().eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "update") {
    if (!row.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { id, ...patch } = row;
    const { error } = await admin
      .from("recurring_expenses")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // insert
  const { category, amount, vendor, description, paymentMethod, frequency, nextDueDate } = row as {
    category?: string;
    amount?: number;
    vendor?: string;
    description?: string;
    paymentMethod?: string;
    frequency?: string;
    nextDueDate?: string;
  };
  if (!category || !amount || amount <= 0) return NextResponse.json({ error: "category and a positive amount are required" }, { status: 400 });
  if (!frequency || !FREQUENCIES.includes(frequency)) return NextResponse.json({ error: "A valid frequency is required" }, { status: 400 });
  if (!nextDueDate) return NextResponse.json({ error: "Next payment date is required" }, { status: 400 });

  const { error } = await admin.from("recurring_expenses").insert({
    restaurant_id: session.restaurantId,
    category,
    amount,
    vendor: vendor || null,
    description: description || null,
    payment_method: paymentMethod || "Cash",
    frequency,
    next_due_date: nextDueDate,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
