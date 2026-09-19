import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Self-made item recipe = raw ingredients consumed per 1 unit produced. Same pattern as
 *  app/api/recipes/route.ts, but the parent is another inventory_items row. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from("inventory_items").select("id").eq("id", itemId).eq("restaurant_id", session.restaurantId).single();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data, error } = await admin
    .from("production_recipe_items")
    .select("id, ingredient_item_id, quantity, ingredient:inventory_items!production_recipe_items_ingredient_item_id_fkey(name, unit, cost)")
    .eq("self_made_item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipeItems: data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Only Admin can edit recipes" }, { status: 403 });

  const { itemId, items } = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    items?: { ingredientItemId: string; quantity: number }[];
  };
  if (!itemId || !items) return NextResponse.json({ error: "itemId and items are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from("inventory_items").select("id").eq("id", itemId).eq("restaurant_id", session.restaurantId).single();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  await admin.from("production_recipe_items").delete().eq("self_made_item_id", itemId);
  if (items.length > 0) {
    const { error } = await admin
      .from("production_recipe_items")
      .insert(items.map((i) => ({ self_made_item_id: itemId, ingredient_item_id: i.ingredientItemId, quantity: i.quantity })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
