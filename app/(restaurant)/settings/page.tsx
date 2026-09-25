import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { SettingsClient } from "./settings-client";

/**
 * Settings now also hosts the Tables & Delivery panels (folded in the same way Payment
 * Methods was), so the page itself is reachable by EITHER the "settings" permission
 * (Restaurant Profile/POS/Printer/FBR — admin only by default) OR the "tables" permission
 * (Manager/Cashier can view by default) — whichever section a role can't see, the client
 * just doesn't render. Table/delivery-area WRITE access is still admin-or-manager only,
 * enforced independently by /api/tables and /api/delivery-areas (unchanged) — canManageTables
 * here only controls whether the add/remove controls render, mirroring what those routes
 * actually allow rather than the broader "tables" view permission.
 */
export default async function SettingsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");

  const [canSettings, canTables] = await Promise.all([
    hasModuleAccess(session.restaurantId, session.role, "settings"),
    hasModuleAccess(session.restaurantId, session.role, "tables"),
  ]);
  if (!canSettings && !canTables) redirect("/dashboard");

  return (
    <SettingsClient
      canSettings={canSettings}
      canTables={canTables}
      canManageTables={session.role === "admin" || session.role === "manager"}
    />
  );
}