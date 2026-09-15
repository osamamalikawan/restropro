import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { EmployeesPanel } from "./employees-panel";

export default async function RestaurantDashboard() {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");
  const { employee, restaurant } = ctx;

  return (
    <main className="page-wrap">
      <div className="mb-6">
        <h1 className="page-heading">Today&apos;s service</h1>
        <p className="page-subtitle">{restaurant.name} · Signed in as {employee.name} ({employee.role})</p>
      </div>
      <EmployeesPanel restaurantId={restaurant.id} />
    </main>
  );
}
