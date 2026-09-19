import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { ComingSoon } from "../coming-soon";

export default async function TicketRailPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!(await hasModuleAccess(session.restaurantId, session.role, "pos"))) redirect("/dashboard");

  return (
    <ComingSoon
      title="Ticket Rail"
      note="The kanban view of active and held kitchen tickets isn't wired up yet — it'll live here, matching the prototype's drag-between-columns board."
    />
  );
}
