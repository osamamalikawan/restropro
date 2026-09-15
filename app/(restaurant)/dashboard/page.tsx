import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { EmployeesPanel } from "./employees-panel";

export default async function RestaurantDashboard() {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");
  const { employee, restaurant } = ctx;

  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-strong">Dashboard</h1>
        <p className="text-ink-faint text-sm">
          Signed in as {employee.name} ({employee.role})
        </p>
      </div>
      <EmployeesPanel restaurantId={restaurant.id} />
    </main>
  );
}
