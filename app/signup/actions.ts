"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth/pin";

export type SignupState = { error?: string; success?: boolean };

/** Restaurant signup. Creates:
 *  1. A real Supabase Auth user for the OWNER (email/password) — this is who can log into
 *     the (future) owner portal and see billing/subscription status.
 *  2. A `restaurants` row with status='pending' and the admin PIN hashed but NOT yet turned
 *     into an `employees` row — that only happens when Super Admin activates the tenant.
 *  Nothing here lets the tenant be used yet; middleware + staff login both check status. */
export async function signupRestaurant(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const restaurantName = String(formData.get("restaurantName") || "").trim();
  const ownerName = String(formData.get("ownerName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const phone = String(formData.get("phone") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const adminPin = String(formData.get("adminPin") || "").trim();
  const planId = String(formData.get("planId") || "");
  const billingCycle = String(formData.get("billingCycle") || "monthly");

  if (!restaurantName || !ownerName || !email || !password || !adminName || !adminPin) {
    return { error: "Please fill in every field." };
  }
  if (!/^\d{4}$/.test(adminPin)) {
    return { error: "Admin PIN must be exactly 4 digits." };
  }

  const admin = createAdminClient();

  // 1. Create the owner's Supabase Auth user (email/password). `email_confirm: true` skips
  //    Supabase's confirmation email for this demo flow — wire up real email confirmation
  //    (or Supabase's built-in one) before going live.
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    return { error: authError?.message || "Could not create the owner account." };
  }

  // 2. Hash the admin PIN now; it's only turned into a real employees row at activation.
  const pendingPinHash = await hashPin(adminPin);

  const slug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { error: insertError } = await admin.from("restaurants").insert({
    slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
    name: restaurantName,
    owner_user_id: authUser.user.id,
    owner_name: ownerName,
    email,
    phone,
    city,
    status: "pending",
    plan_id: planId || null,
    billing_cycle: billingCycle,
    pending_admin_name: adminName,
    pending_admin_pin_hash: pendingPinHash,
  });

  if (insertError) {
    // roll back the auth user so a failed signup doesn't leave an orphaned account
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: insertError.message };
  }

  return { success: true };
}

export async function getActivePlans() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, name, monthly_price, yearly_price, features")
    .eq("is_active", true)
    .order("monthly_price");
  return data ?? [];
}
