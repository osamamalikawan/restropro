import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lists the `users` table (see migration 0014) joined with the employee it belongs to.
 * `users` is kept in sync with `employees.pin_hash` by a DB trigger — creating, changing, or
 * revoking a user's access all happen through /api/employees (op "update" with a `pin`, or
 * "revokeUser"), exactly like the Employees page already does. This page is a different view
 * onto the same underlying access, not a second place that grants it independently.
 */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, employee_id, is_active, created_at, employees(name, role, status)")
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data });
}
