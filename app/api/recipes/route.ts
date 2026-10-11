import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Recipe = which inventory items (and how much of each) are consumed per 1 unit of a
 *  product sold. GET ?productId=... returns the current list; POST replaces it wholesale
 *  (simplest correct approach for a small ingredient list — delete-then-reinsert). */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const productId = new URL(req.url).searchParams.get("productId");
  const admin = createAdminClient();

  if (!productId) {
    // Bulk mode — every recipe line for this tenant's products, used to compute cost/margin
    // on the Products page without an N+1 fetch per row.
    const { data, error } = await admin
      .from("recipe_items")
      .select("id, product_id, inventory_item_id, quantity, inventory_items!inner(name, unit, cost, restaurant_id)")
      .eq("inventory_items.restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recipeItems: data });
  }

  // ownership check: the product must belong to this session's restaurant
  const { data: product } = await admin.from("products").select("id").eq("id", productId).eq("restaurant_id", session.restaurantId).single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data, error } = await admin
    .from("recipe_items")
    .select("id, inventory_item_id, quantity, inventory_items(name, unit, cost)")
    .eq("product_id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipeItems: data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Only Admin can edit recipes" }, { status: 403 });
  }

  const { productId, items } = (await req.json().catch(() => ({}))) as {
    productId?: string;
    items?: { inventoryItemId: string; quantity: number }[];
  };
  if (!productId || !Array.isArray(items)) return NextResponse.json({ error: "productId and items are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, is_deal")
    .eq("id", productId)
    .eq("restaurant_id", session.restaurantId)
    .single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.is_deal) {
    // a deal's recipe is built automatically from the products inside it (see app/api/deals/route.ts)
    return NextResponse.json({ error: "A deal's recipe comes from the products inside the deal - edit those products' recipes instead" }, { status: 400 });
  }

  // clean the list: positive quantities, one line per ingredient, and only this restaurant's inventory items
  const merged = new Map<string, number>();
  for (const i of items) {
    const q = Number(i.quantity);
    if (!i.inventoryItemId || !Number.isFinite(q) || q <= 0) continue;
    merged.set(i.inventoryItemId, Math.round(q * 1_000_000) / 1_000_000);
  }
  if (merged.size > 0) {
    const { data: owned } = await admin
      .from("inventory_items")
      .select("id")
      .eq("restaurant_id", session.restaurantId)
      .in("id", [...merged.keys()]);
    if ((owned ?? []).length !== merged.size) return NextResponse.json({ error: "One of the ingredients no longer exists - reload the page and try again" }, { status: 400 });
  }

  // Replace the recipe, but never lose the old one: remember it, and put it back if anything fails half way.
  const { data: old, error: readErr } = await admin.from("recipe_items").select("product_id, inventory_item_id, quantity").eq("product_id", productId);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const del = await admin.from("recipe_items").delete().eq("product_id", productId);
  if (del.error) return NextResponse.json({ error: `Could not replace the old recipe: ${del.error.message}` }, { status: 500 });

  if (merged.size > 0) {
    const rows = [...merged].map(([inventory_item_id, quantity]) => ({ product_id: productId, inventory_item_id, quantity }));
    const ins = await admin.from("recipe_items").insert(rows);
    if (ins.error) {
      if (old?.length) await admin.from("recipe_items").insert(old); // restore what was there
      return NextResponse.json({ error: `Recipe was not saved: ${ins.error.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true, lines: merged.size });
}
