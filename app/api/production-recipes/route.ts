import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Self-made item recipe. The page works with a BATCH: the ingredients used, and the final product weight (yield)
 *  that batch makes. What is stored per self-made item is the amount of each ingredient needed for ONE unit
 *  (batch quantity / yield) - exactly what log_production() multiplies by the quantity produced - plus the batch
 *  size in inventory_items.recipe_yield (migration 0026) so the page can show the batch again.
 *
 *  GET ?itemId=  -> { recipeItems (per-unit quantities), yieldWeight (null = recipe was saved per 1 unit) }
 *  POST { itemId, items: [{ ingredientItemId, quantity (for the whole batch) }], yieldWeight } */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from("inventory_items").select("*").eq("id", itemId).eq("restaurant_id", session.restaurantId).single();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data, error } = await admin
    .from("production_recipe_items")
    .select("id, ingredient_item_id, quantity, ingredient:inventory_items!production_recipe_items_ingredient_item_id_fkey(name, unit, cost)")
    .eq("self_made_item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const y = Number(item.recipe_yield);
  return NextResponse.json({ recipeItems: data, yieldWeight: Number.isFinite(y) && y > 0 ? y : null });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Only Admin can edit recipes" }, { status: 403 });

  const { itemId, items, yieldWeight } = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    items?: { ingredientItemId: string; quantity: number }[];
    yieldWeight?: number;
  };
  if (!itemId || !Array.isArray(items)) return NextResponse.json({ error: "itemId and items are required" }, { status: 400 });
  const W = yieldWeight === undefined ? 1 : Number(yieldWeight);
  if (!Number.isFinite(W) || W <= 0) return NextResponse.json({ error: "The final product weight must be more than 0" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from("inventory_items").select("id").eq("id", itemId).eq("restaurant_id", session.restaurantId).single();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const merged = new Map<string, number>();
  for (const i of items) {
    const q = Number(i.quantity);
    if (!i.ingredientItemId || i.ingredientItemId === itemId || !Number.isFinite(q) || q <= 0) continue;
    merged.set(i.ingredientItemId, (merged.get(i.ingredientItemId) ?? 0) + q);
  }
  if (merged.size > 0) {
    const { data: owned } = await admin.from("inventory_items").select("id").eq("restaurant_id", session.restaurantId).in("id", [...merged.keys()]);
    if ((owned ?? []).length !== merged.size) return NextResponse.json({ error: "One of the ingredients no longer exists - reload the page and try again" }, { status: 400 });
  }

  // remember the batch size first (fails clearly if migration 0026 is missing and the yield is not the old default of 1)
  const yRes = await admin.from("inventory_items").update({ recipe_yield: W }).eq("id", itemId);
  if (yRes.error) {
    if (/recipe_yield/.test(yRes.error.message) && W !== 1) {
      return NextResponse.json({ error: "Run migration 0026_cancel_notes_recipe_yield_restock_logger.sql in Supabase to save the final product weight" }, { status: 500 });
    }
    if (!/recipe_yield/.test(yRes.error.message)) return NextResponse.json({ error: yRes.error.message }, { status: 500 });
  }

  const { data: old, error: readErr } = await admin.from("production_recipe_items").select("self_made_item_id, ingredient_item_id, quantity").eq("self_made_item_id", itemId);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const del = await admin.from("production_recipe_items").delete().eq("self_made_item_id", itemId);
  if (del.error) return NextResponse.json({ error: `Could not replace the old recipe: ${del.error.message}` }, { status: 500 });

  if (merged.size > 0) {
    const rows = [...merged].map(([ingredient_item_id, q]) => ({
      self_made_item_id: itemId,
      ingredient_item_id,
      quantity: Math.round((q / W) * 1_000_000) / 1_000_000, // per 1 unit made
    }));
    const ins = await admin.from("production_recipe_items").insert(rows);
    if (ins.error) {
      if (old?.length) await admin.from("production_recipe_items").insert(old); // put the old recipe back
      return NextResponse.json({ error: `Recipe was not saved: ${ins.error.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true, lines: merged.size });
}
