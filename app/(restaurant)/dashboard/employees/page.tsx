import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { canAccess } from "../nav-config";
import { ComingSoon } from "../coming-soon";

export default async function EmployeesPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!canAccess(session.role, "employees")) redirect("/dashboard");

  return (
    <ComingSoon
      title="Employees"
      note="The staff directory with roles, shifts and per-employee profiles isn't wired up yet — it'll live here, matching the prototype's Employees table."
    />
  );
}
