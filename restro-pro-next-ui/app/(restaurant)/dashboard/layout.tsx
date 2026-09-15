import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Wraps every /dashboard/* page with the persistent sidebar + topbar that were missing —
 * each individual page previously rendered as a bare standalone screen. This is the ONE place
 * the "is there a valid session, is the restaurant active, is the subscription usable" check
 * happens for the dashboard section; individual pages still do their own additional role
 * checks (e.g. Settings requires admin) on top of this.
 *
 * /pos is intentionally OUTSIDE this layout (it's a sibling route, app/pos/page.tsx) — a
 * cashier terminal benefits from a distraction-free full-screen POS rather than the same
 * chrome as the back-office pages.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex">
      <Sidebar role={ctx.employee.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar restaurantName={ctx.restaurant.name} employeeName={ctx.employee.name} role={ctx.employee.role} subStatus={ctx.subStatus} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
