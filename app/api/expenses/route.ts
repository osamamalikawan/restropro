import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();

  const admin = createAdminClient();
  let query = admin
    .from("expenses")
    .select("id, category, expense_type, amount, vendor, description, payment_method, txn_date")
    .eq("restaurant_id", session.restaurantId)
    .order("txn_date", { ascending: false })
    .limit(limit);
  if (from) query = query.gte("txn_date", from);
  if (to) query = query.lte("txn_date", to);
  if (q) query = query.or(`category.ilike.%${q}%,vendor.ilike.%${q}%,description.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data });
}

/** Logs an expense via the atomic `log_expense` Postgres function — writes the expense row
 *  and books the matching accounts entry in one transaction. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { category, expenseType, amount, vendor, description, paymentMethod } = (await req.json().catch(() => ({}))) as {
    category?: string;
    expenseType?: "regular" | "recurring";
    amount?: number;
    vendor?: string;
    description?: string;
    paymentMethod?: string;
  };
  if (!category || !amount) {
    return NextResponse.json({ error: "category and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_expense", {
    p_restaurant_id: session.restaurantId,
    p_category: category,
    p_expense_type: expenseType || "regular",
    p_amount: amount,
    p_vendor: vendor || null,
    p_description: description || null,
    p_payment_method: paymentMethod || "Cash",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
