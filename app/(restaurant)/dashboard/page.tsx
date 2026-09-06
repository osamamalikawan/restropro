import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, isUsable } from "@/lib/subscription";
import { EmployeesPanel } from "./employees-panel";

export default async function RestaurantDashboard() {
  const token = cookies().get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");

  const admin = createAdminClient();

  // Re-verify session_version (cheap single-row lookups) so a forced-logout / PIN reset takes
  // effect immediately even though the cookie itself is still validly signed.
  const { data: employee } = await admin
    .from("employees")
    .select("id, name, role, session_version, status")
    .eq("id", session.employeeId)
    .single();
  if (!employee || employee.status !== "active" || employee.session_version !== session.sessionVersion) {
    redirect("/login");
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, status")
    .eq("id", session.restaurantId)
    .single();
  if (!restaurant || restaurant.status !== "active") redirect("/login");

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const subStatus = sub ? computeStatus(sub) : "expired";
  if (sub && !isUsable(subStatus)) redirect("/login");

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">{restaurant.name}</h1>
          <p className="text-neutral-400 text-sm">
            Signed in as {employee.name} ({employee.role})
          </p>
        </div>
        {subStatus === "grace" && (
          <span className="rounded-full bg-turmeric-500/20 text-turmeric-400 text-xs font-semibold px-3 py-1.5">
            Subscription in grace period — please renew
          </span>
        )}
      </div>
      <EmployeesPanel restaurantId={restaurant.id} />
    </main>
  );
}
