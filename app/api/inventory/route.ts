import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const cols = "id, name, unit, item_type, category, current_stock, min_stock, cost, updated_at";
  // items removed from the Inventory page are hidden (deleted_at, migration 0029), never listed again
  let res: { data: unknown; error: { message: string } | null } = await admin
    .from("inventory_items")
    .select(cols)
    .eq("restaurant_id", session.restaurantId)
    .is("deleted_at", null)
    .order("name");
  if (res.error && /deleted_at/.test(res.error.message)) {
    res = await admin.from("inventory_items").select(cols).eq("restaurant_id", session.restaurantId).order("name");
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ inventoryItems: res.data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager" && session.role !== "inventory") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: any };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();
  if (op === "delete") {
    // "Remove" hides the item (nothing is deleted, history stays intact) - but only when nothing uses it:
    // not an ingredient in any product's recipe and not an ingredient in any self-made item's recipe.
    const { data: item } = await admin.from("inventory_items").select("id, name").eq("id", row.id).eq("restaurant_id", session.restaurantId).maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // who uses it? (plain queries - a failed lookup must never be read as "unused")
    const [rec, prod] = await Promise.all([
      admin.from("recipe_items").select("product_id").eq("inventory_item_id", row.id),
      admin.from("production_recipe_items").select("self_made_item_id").eq("ingredient_item_id", row.id),
    ]);
    if (rec.error || prod.error) return NextResponse.json({ error: `Could not check where this item is used: ${(rec.error ?? prod.error)!.message}` }, { status: 500 });

    const productIds = [...new Set((rec.data ?? []).map((r) => r.product_id as string))];
    const selfMadeIds = [...new Set((prod.data ?? []).map((r) => r.self_made_item_id as string))];
    let productNames: string[] = [];
    let selfMadeNames: string[] = [];
    if (productIds.length) {
      // products that have been removed from the menu don't count
      const { data, error } = await admin.from("products").select("name").in("id", productIds).eq("restaurant_id", session.restaurantId).is("deleted_at", null);
      if (error) return NextResponse.json({ error: `Could not check where this item is used: ${error.message}` }, { status: 500 });
      productNames = (data ?? []).map((p) => p.name as string);
    }
    if (selfMadeIds.length) {
      // self-made items that were themselves removed don't count
      let q = await admin.from("inventory_items").select("name").in("id", selfMadeIds).eq("restaurant_id", session.restaurantId).is("deleted_at", null);
      if (q.error && /deleted_at/.test(q.error.message)) q = await admin.from("inventory_items").select("name").in("id", selfMadeIds).eq("restaurant_id", session.restaurantId);
      if (q.error) return NextResponse.json({ error: `Could not check where this item is used: ${q.error.message}` }, { status: 500 });
      selfMadeNames = (q.data ?? []).map((i) => i.name as string);
    }
    if (productNames.length || selfMadeNames.length) {
      const show = (a: string[]) => a.slice(0, 5).join(", ") + (a.length > 5 ? ` and ${a.length - 5} more` : "");
      const parts = [productNames.length ? `product recipes (${show(productNames)})` : "", selfMadeNames.length ? `self-made item recipes (${show(selfMadeNames)})` : ""].filter(Boolean);
      return NextResponse.json({ error: `"${item.name}" can't be removed - it is used in ${parts.join(" and ")}. Take it out of those recipes first.`, usedIn: { products: productNames, selfMade: selfMadeNames } }, { status: 409 });
    }

    const { error } = await admin.from("inventory_items").update({ deleted_at: new Date().toISOString() }).eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) {
      const missing = /deleted_at/.test(error.message);
      return NextResponse.json({ error: missing ? "Run migration 0029_item_order_and_hide_inventory.sql in Supabase first" : error.message }, { status: 500 });
    }
  } else {
    const payload = { ...row, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };
    const { error } = await admin.from("inventory_items").upsert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
