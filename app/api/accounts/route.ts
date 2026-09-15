import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .select("id, txn_date, description, category, type, amount")
    .eq("restaurant_id", session.restaurantId)
    .order("txn_date", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data });
}

/** Manual ledger entries (e.g. logging an expense) — Admin/Manager only. Sales entries are
 *  created automatically by app/api/sales/route.ts, not through this POST. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { description, category, type, amount } = (await req.json().catch(() => ({}))) as {
    description?: string;
    category?: string;
    type?: "income" | "expense";
    amount?: number;
  };
  if (!description || !type || !amount) {
    return NextResponse.json({ error: "description, type, and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("accounts").insert({
    restaurant_id: session.restaurantId,
    txn_date: new Date().toISOString().slice(0, 10),
    description,
    category: category || (type === "income" ? "Other income" : "Other expense"),
    type,
    amount,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
