import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { canAccess } from "../nav-config";
import { ComingSoon } from "../coming-soon";

export default async function UnpaidOrdersPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!canAccess(session.role, "sales")) redirect("/dashboard");

  return (
    <ComingSoon
      title="Unpaid Orders"
      note="Orders saved without full payment isn't wired up yet — it'll live here, matching the prototype's collect-balance table."
    />
  );
}
