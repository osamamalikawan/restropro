import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { canAccess } from "../nav-config";
import { ComingSoon } from "../coming-soon";

export default async function PaymentMethodsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!canAccess(session.role, "settings")) redirect("/dashboard");

  return (
    <ComingSoon
      title="Payment Methods"
      note="The list of options customers can split payment across isn't wired up yet — it'll live here, matching the prototype's Payment Methods panel."
    />
  );
}
