import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { ComingSoon } from "../coming-soon";

export default async function ProductsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!(await hasModuleAccess(session.restaurantId, session.role, "products"))) redirect("/dashboard");

  return (
    <ComingSoon
      title="Products"
      note="Cost & selling price for every menu item isn't wired up yet — it'll live here, matching the prototype's admin-only Products table."
    />
  );
}
