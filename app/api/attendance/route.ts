import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import {
  ATTENDANCE_COLUMNS,
  ATTENDANCE_MIGRATION_WARNING,
  clockInEmployee,
  clockOutEmployee,
  closeExpiredAttendance,
  isMissingAttendanceTable,
} from "@/lib/attendance";

const MANAGER_ROLES = ["admin", "manager"];

/** Attendance records, newest first, paged like the other lists: ?limit (default 50, max 200) &offset,
 *  ?employeeId=, ?from= & ?to= (ISO instants, on clock-in time). Returns { records, hasMore }; the first page
 *  (offset 0) also returns { totals: { records, minutes, days } } for the whole filtered range. Anyone with the
 *  Employees permission can read it (the employee profile and the Attendance page both use this). */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "employees"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const admin = createAdminClient();
  await closeExpiredAttendance(admin, session.restaurantId); // clock out anyone whose shift has ended

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const employeeId = sp.get("employeeId");
  const iso = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
  const from = iso(sp.get("from"));
  const to = iso(sp.get("to"));

  const build = (columns: string) => {
    let q = admin.from("attendance_records").select(columns).eq("restaurant_id", session.restaurantId);
    if (employeeId) q = q.eq("employee_id", employeeId);
    if (from) q = q.gte("clock_in_at", from);
    if (to) q = q.lte("clock_in_at", to);
    return q;
  };

  const { data, error } = await build(ATTENDANCE_COLUMNS).order("clock_in_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
  if (error) return NextResponse.json({ error: isMissingAttendanceTable(error) ? ATTENDANCE_MIGRATION_WARNING : error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const body: Record<string, unknown> = { records: rows.slice(0, limit), hasMore: rows.length > limit };

  if (offset === 0) {
    let records = 0;
    let minutes = 0;
    const days = new Set<string>();
    for (let start = 0, i = 0; i < 30; i++, start += 1000) {
      const { data: part, error: e2 } = await build("clock_in_at, minutes").order("id", { ascending: true }).range(start, start + 999);
      if (e2) break;
      for (const r of (part ?? []) as unknown as { clock_in_at: string; minutes: number | null }[]) {
        records += 1;
        minutes += Number(r.minutes) || 0;
        days.add(r.clock_in_at.slice(0, 10));
      }
      if ((part ?? []).length < 1000) break;
    }
    body.totals = { records, minutes, days: days.size };
  }
  return NextResponse.json(body);
}

/** Mark someone in or out - they do not need to be a user of the app. Admin / Manager only.
 *  Body: { op: "clockIn" | "clockOut", employeeId, at?: ISO time (to fix a forgotten mark), note? } */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.role)) return NextResponse.json({ error: "Only Admin or Manager can mark attendance" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { op?: string; employeeId?: string; at?: string; note?: string };
  if (!b.employeeId || (b.op !== "clockIn" && b.op !== "clockOut")) return NextResponse.json({ error: "op and employeeId are required" }, { status: 400 });

  const admin = createAdminClient();
  await closeExpiredAttendance(admin, session.restaurantId);
  const { data: me } = await admin.from("employees").select("name").eq("id", session.employeeId).maybeSingle();
  const markedBy = me?.name ?? session.role;

  if (b.op === "clockIn") {
    const r = await clockInEmployee(admin, { restaurantId: session.restaurantId, employeeId: b.employeeId, at: b.at, source: "manual", markedBy, note: b.note?.trim() || null });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    if (r.already) return NextResponse.json({ error: "Already clocked in" }, { status: 409 });
    return NextResponse.json({ success: true, record: r.record });
  }
  const r = await clockOutEmployee(admin, { restaurantId: session.restaurantId, employeeId: b.employeeId, at: b.at, markedBy });
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  if (!r.record) return NextResponse.json({ error: "Not clocked in" }, { status: 409 });
  return NextResponse.json({ success: true, record: r.record });
}
