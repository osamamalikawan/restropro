import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET ?q=... searches by name or phone (used by both the Customers page and the POS checkout
 *  customer picker). Paged: ?limit (default 50, max 200) & ?offset; returns { customers, hasMore }.
 *  ?stats=1 adds { stats: { [customerId]: { orders, spend, lastOrderAt } } } for just this page of
 *  customers, computed in one light query — so the Customers page no longer downloads the
 *  last 1000 full sales (with items) only to add up a few numbers. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const wantStats = sp.get("stats") === "1";

  const admin = createAdminClient();
  let query = admin
    .from("customers")
    .select("id, name, phone, address, area_id, delivery_areas(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("name")
    .order("id");
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, error } = await query.range(offset, offset + limit); // limit + 1 rows
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  const customers = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  if (!wantStats || customers.length === 0) return NextResponse.json({ customers, hasMore });

  const { data: sales, error: salesError } = await admin
    .from("sales")
    .select("customer_id, total, created_at")
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "cancelled")
    .in("customer_id", customers.map((c) => c.id))
    .order("created_at", { ascending: false });
  if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });

  const stats: Record<string, { orders: number; spend: number; lastOrderAt: string | null }> = {};
  for (const c of customers) stats[c.id] = { orders: 0, spend: 0, lastOrderAt: null };
  for (const s of sales ?? []) {
    const st = stats[s.customer_id as string];
    if (!st) continue;
    st.orders += 1;
    st.spend += Number(s.total);
    if (!st.lastOrderAt) st.lastOrderAt = s.created_at; // rows are newest-first
  }
  return NextResponse.json({ customers, hasMore, stats });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();
  if (op === "delete") {
    const { error } = await admin.from("customers").delete().eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (row.phone) {
      const { data: dupe } = await admin
        .from("customers")
        .select("id")
        .eq("restaurant_id", session.restaurantId)
        .eq("phone", row.phone)
        .neq("id", row.id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (dupe) return NextResponse.json({ error: "That phone number is already used by another customer" }, { status: 409 });
    }
    const payload = { ...row, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };
    const { error } = await admin.from("customers").upsert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
