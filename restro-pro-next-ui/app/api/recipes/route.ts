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
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });

  const admin = createAdminClient();
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
  if (!productId || !items) return NextResponse.json({ error: "productId and items are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: product } = await admin.from("products").select("id").eq("id", productId).eq("restaurant_id", session.restaurantId).single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await admin.from("recipe_items").delete().eq("product_id", productId);
  if (items.length > 0) {
    const { error } = await admin.from("recipe_items").insert(
      items.map((i) => ({ product_id: productId, inventory_item_id: i.inventoryItemId, quantity: i.quantity }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
