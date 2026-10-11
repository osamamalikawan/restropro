import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeExpiredAttendance } from "@/lib/attendance";

/** Daily safety net for "auto clock-out at the end of the shift": closes every restaurant's attendance records whose
 *  shift has ended. (The Attendance page and employee profile also do this whenever they are opened, so the figures
 *  are right even between cron runs.) Same CRON_SECRET check as /api/cron/check-subscriptions. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("attendance_records").select("restaurant_id").eq("status", "open").limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((data ?? []).map((r) => r.restaurant_id as string))];
  for (const id of ids) await closeExpiredAttendance(admin, id);
  return NextResponse.json({ restaurants: ids.length });
}
