import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET ?q=... searches by name or phone (used by both the Customers page and the POS
 *  checkout customer picker). No query param = full list. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const admin = createAdminClient();
  let query = admin
    .from("customers")
    .select("id, name, phone, address, area_id, delivery_areas(name)")
    .eq("restaurant_id", session.restaurantId)
    .order("name")
    .limit(50);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data });
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
