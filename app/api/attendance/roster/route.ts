import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { closeExpiredAttendance, isMissingAttendanceTable, ATTENDANCE_MIGRATION_WARNING, getShiftConfig } from "@/lib/attendance";

/** Everyone on the roster (not only app users) with whether they are clocked in right now - the Attendance page's
 *  main list - plus the shift timings so the page can say when auto clock-out happens. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "employees"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const admin = createAdminClient();
  await closeExpiredAttendance(admin, session.restaurantId);

  const [{ data: emps, error: e1 }, { data: open, error: e2 }, cfg] = await Promise.all([
    admin.from("employees").select("id, name, role, status").eq("restaurant_id", session.restaurantId).neq("status", "left").order("name"),
    admin.from("attendance_records").select("id, employee_id, clock_in_at, source").eq("restaurant_id", session.restaurantId).eq("status", "open"),
    getShiftConfig(admin, session.restaurantId),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: isMissingAttendanceTable(e2) ? ATTENDANCE_MIGRATION_WARNING : e2.message }, { status: 500 });

  const openBy = new Map((open ?? []).map((o) => [o.employee_id as string, o]));
  const employees = (emps ?? []).map((e) => ({ ...e, open: openBy.get(e.id as string) ?? null }));
  return NextResponse.json({ employees, shift: { start: cfg.start, end: cfg.end } });
}
