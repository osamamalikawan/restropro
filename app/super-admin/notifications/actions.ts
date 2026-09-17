"use server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function assertSuperAdmin() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", auth.user.id).single();
  if (!data) throw new Error("Not a super admin");
  return auth.user;
}

export async function listRestaurantsForPicker() {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("restaurants").select("id, name").order("name");
  return data ?? [];
}

/** Sends to 'all' (every current restaurant, fanned out into notification_recipients at send
 *  time — simplest to query later, at the cost of a row per restaurant per notification),
 *  or 'selected' (only the restaurant IDs passed in). */
export async function sendNotification(formData: FormData) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const audience = String(formData.get("audience") || "selected") as "all" | "selected";
  const selectedIds = formData.getAll("restaurantIds").map(String);

  if (!title || !body) throw new Error("Title and body are required");

  const { data: notif, error } = await admin
    .from("notifications")
    .insert({ title, body, audience, created_by: actor.id })
    .select("id")
    .single();
  if (error || !notif) throw new Error(error?.message || "Could not create notification");

  let targetIds = selectedIds;
  if (audience === "all") {
    const { data: allRestaurants } = await admin.from("restaurants").select("id");
    targetIds = (allRestaurants ?? []).map((r) => r.id);
  }
  if (targetIds.length > 0) {
    await admin
      .from("notification_recipients")
      .insert(targetIds.map((restaurant_id) => ({ notification_id: notif.id, restaurant_id })));
  }

  revalidatePath("/super-admin/notifications");
}

export async function listSentNotifications() {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("notifications")
    .select("id, title, body, audience, created_at, notification_recipients(count)")
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}
