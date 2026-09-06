"use server";
import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { graceUntil } from "@/lib/subscription";

async function assertSuperAdmin() {
  const supabase = createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", auth.user.id).single();
  if (!data) throw new Error("Not a super admin");
  return auth.user;
}

export async function listRestaurants() {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("restaurants")
    .select("id, name, owner_name, email, status, plan_id, billing_cycle, created_at, pending_admin_name")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * The core of the requested flow:
 *  1. restaurants.status -> 'active'
 *  2. Create the `employees` row for the admin, using the PIN captured at signup
 *  3. Clear the pending_admin_* columns (PIN hash should not linger once consumed)
 *  4. Create the first `subscriptions` row with a 3-day grace period after the period end
 *  5. Log an audit entry + send a welcome notification to that one restaurant
 */
export async function activateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  const { data: restaurant, error: fetchError } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();
  if (fetchError || !restaurant) throw new Error("Restaurant not found");
  if (!restaurant.pending_admin_pin_hash) throw new Error("No pending admin PIN found for this restaurant");

  const now = new Date();
  const periodDays = restaurant.billing_cycle === "yearly" ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  const { error: updateError } = await admin
    .from("restaurants")
    .update({
      status: "active",
      activated_at: now.toISOString(),
      pending_admin_name: null,
      pending_admin_pin_hash: null,
    })
    .eq("id", restaurantId);
  if (updateError) throw new Error(updateError.message);

  const { error: employeeError } = await admin.from("employees").insert({
    restaurant_id: restaurantId,
    name: restaurant.pending_admin_name,
    role: "admin",
    pin_hash: restaurant.pending_admin_pin_hash,
    status: "active",
  });
  if (employeeError) throw new Error(employeeError.message);

  await admin.from("subscriptions").insert({
    restaurant_id: restaurantId,
    plan_id: restaurant.plan_id,
    billing_cycle: restaurant.billing_cycle,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    grace_until: graceUntil(periodEnd).toISOString(),
    status: "active",
  });

  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_activated",
    entity: "restaurant",
    entity_id: restaurantId,
  });

  const { data: notif } = await admin
    .from("notifications")
    .insert({
      title: "Welcome to Restro Pro 🎉",
      body: "Your restaurant has been activated. Log in with your admin PIN to get started.",
      audience: "selected",
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (notif) {
    await admin.from("notification_recipients").insert({ notification_id: notif.id, restaurant_id: restaurantId });
  }

  revalidatePath("/super-admin/dashboard");
}

export async function suspendRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "suspended" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_suspended",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/dashboard");
}

export async function reactivateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_reactivated",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/dashboard");
}

export async function terminateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "terminated" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_terminated",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/dashboard");
}
