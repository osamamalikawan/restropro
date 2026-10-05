import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const list = () =>
    admin
      .from("products")
      .select("id, restaurant_id, category_id, name, price, image_url, is_available, updated_at, menu_categories(name, sort_order)")
      .eq("restaurant_id", session.restaurantId)
      .order("name");
  // removed products (deleted_at set) stay in the database for old sales but are never listed;
  // before migration 0018 the column doesn't exist yet, so fall back to the plain list
  let { data, error } = await list().is("deleted_at", null);
  if (error && /deleted_at/.test(error.message)) ({ data, error } = await list());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();
  if (op === "delete") {
    // Soft delete: hide it everywhere, keep the row so past sales and reports stay intact. Admin only.
    if (session.role !== "admin") return NextResponse.json({ error: "Only an admin can remove products" }, { status: 403 });
    const { error } = await admin
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_available: false, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) {
      const missing = /deleted_at/.test(error.message);
      return NextResponse.json({ error: missing ? "Run migration 0018_soft_delete_products.sql in Supabase first" : error.message }, { status: 500 });
    }
  } else {
    const { menu_categories, ...clean } = row; // drop the joined field if it came back around from a GET response
    const payload = { ...clean, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };
    const { error } = await admin.from("products").upsert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
