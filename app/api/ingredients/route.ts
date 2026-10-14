import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_ROLES = ["admin", "manager", "inventory"];

/** The platform-wide ingredient list (managed in Super Admin). Each row says whether this
 *  restaurant already has an inventory item with the same name. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: ingredients, error }, { data: existing }] = await Promise.all([
    admin.from("ingredients").select("id, name, category, item_type, unit").eq("is_active", true).order("category").order("name"),
    admin.from("inventory_items").select("name").eq("restaurant_id", session.restaurantId),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const have = new Set((existing ?? []).map((r: any) => String(r.name).trim().toLowerCase()));
  return NextResponse.json({
    ingredients: (ingredients ?? []).map((i: any) => ({ ...i, alreadyAdded: have.has(String(i.name).trim().toLowerCase()) })),
  });
}

/** Copies ingredients into this restaurant's inventory_items. Body: { ids: string[] } for specific
 *  rows, or { all: true } for the whole list. Names the restaurant already has (case-insensitive)
 *  are skipped, so importing twice never creates duplicates. Stock and cost start at 0. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { ids, all } = (await req.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: "Choose at least one ingredient" }, { status: 400 });
  }

  const admin = createAdminClient();
  let q = admin.from("ingredients").select("id, name, category, item_type, unit").eq("is_active", true);
  if (!all) q = q.in("id", ids as string[]);
  const [{ data: picked, error }, { data: existing }] = await Promise.all([
    q,
    admin.from("inventory_items").select("name").eq("restaurant_id", session.restaurantId),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const have = new Set((existing ?? []).map((r: any) => String(r.name).trim().toLowerCase()));
  const toInsert = (picked ?? [])
    .filter((i: any) => !have.has(String(i.name).trim().toLowerCase()))
    .map((i: any) => ({
      restaurant_id: session.restaurantId,
      name: i.name,
      category: i.category,
      item_type: i.item_type,
      unit: i.unit,
      current_stock: 0,
      min_stock: 0,
      cost: 0,
    }));

  for (let start = 0; start < toInsert.length; start += 200) {
    const { error: insertError } = await admin.from("inventory_items").insert(toInsert.slice(start, start + 200));
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, imported: toInsert.length, skipped: (picked ?? []).length - toInsert.length });
}
