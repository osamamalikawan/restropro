import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { ComingSoon } from "../coming-soon";

export default async function SalesPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) redirect("/dashboard");

  return (
    <ComingSoon
      title="Sales"
      note="Full searchable order history across every channel isn't wired up yet — it'll live here, matching the prototype's Sales table."
    />
  );
}
