import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth/require-device";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPermissionMatrix } from "@/lib/permissions";
import { computeStatus } from "@/lib/subscription";

/** Everything the desktop POS needs to run offline, in one round trip. The device calls this
 *  on activation, then whenever it is online (see restropro-desk/src/sync.rs). The response is
 *  stored verbatim in the device's local database, so keep the shapes identical to the staff
 *  routes the POS screen already understands (/api/products, /api/tables, ...). */
export async function GET(req: Request) {
  const auth = await requireDevice(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  const rid = auth.device.restaurantId;
  const admin = createAdminClient();

  const [restaurant, products, tables, areas, methods, staff, customers, settingsRes] = await Promise.all([
    admin.from("restaurants").select("name, address, phone, slug").eq("id", rid).single(),
    admin
      .from("products")
      .select("id, restaurant_id, category_id, name, price, image_url, is_available, updated_at, menu_categories(name)")
      .eq("restaurant_id", rid)
      .order("name"),
    admin.from("tables").select("id, number, seats, is_active").eq("restaurant_id", rid).order("number"),
    admin.from("delivery_areas").select("id, name, delivery_fee, is_active").eq("restaurant_id", rid).order("name"),
    admin.from("payment_methods").select("id, name").eq("restaurant_id", rid).order("name"),
    admin.from("employees").select("id, name, role, pin_hash, status").eq("restaurant_id", rid).not("pin_hash", "is", null),
    admin
      .from("customers")
      .select("id, name, phone, address, area_id, delivery_areas(name)")
      .eq("restaurant_id", rid)
      .order("name")
      .limit(5000),
    admin.from("restaurant_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
  ]);

  const failed = [restaurant, products, tables, areas, methods, staff, customers, settingsRes].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const [permissionMatrix, subRes] = await Promise.all([
    getPermissionMatrix(rid),
    admin
      .from("subscriptions")
      .select("current_period_end, grace_until, status")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let settings = settingsRes.data;
  if (!settings) {
    const { data: created } = await admin.from("restaurant_settings").insert({ restaurant_id: rid }).select("*").single();
    settings = created;
  }

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    restaurant: restaurant.data,
    settings: settings ?? {},
    products: products.data ?? [],
    tables: tables.data ?? [],
    areas: areas.data ?? [],
    paymentMethods: methods.data ?? [],
    customers: customers.data ?? [],
    staffRoster: staff.data ?? [],
    /** role -> module -> can_view, so the desktop sidebar and page guards work offline */
    permissionMatrix,
    subStatus: subRes.data ? computeStatus(subRes.data) : "expired",
  });
}
