import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeExpiredAttendance } from "@/lib/attendance";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("dashboard_summary", { p_restaurant_id: session.restaurantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "On shift now" = employees clocked in on the Attendance page right now (anyone whose shift has ended is clocked
  // out first). The summary function counts every active employee, which is not who is actually working.
  // If the attendance table is not there yet (migration 0025), the old figure is kept.
  const summary = data as Record<string, unknown>;
  await closeExpiredAttendance(admin, session.restaurantId);
  const open = await admin.from("attendance_records").select("employee_id").eq("restaurant_id", session.restaurantId).eq("status", "open");
  if (!open.error) summary.activeEmployees = new Set((open.data ?? []).map((r) => r.employee_id as string)).size;

  // Low stock: the summary counts every inventory row, including items that were removed (hidden) from the Inventory
  // page. Recount the visible ones with the same rule the Inventory page shows ("Low stock" = below the minimum).
  const stock = await admin.from("inventory_items").select("current_stock, min_stock").eq("restaurant_id", session.restaurantId).is("deleted_at", null);
  if (!stock.error) summary.lowStockCount = (stock.data ?? []).filter((i) => Number(i.current_stock) < Number(i.min_stock)).length;

  return NextResponse.json({ summary });
}
