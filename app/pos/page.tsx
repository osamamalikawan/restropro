import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { PosClient } from "./pos-client";

export default async function PosPage() {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");

  return <PosClient restaurantId={ctx.restaurant.id} restaurantName={ctx.restaurant.name} cashierName={ctx.employee.name} />;
}
