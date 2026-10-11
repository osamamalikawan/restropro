import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { isMissingRiderColumn, RIDER_MIGRATION_WARNING } from "@/lib/riders";

/** Rider shift submissions (what each rider handed in), newest first, paged. ?riderId= ?from= ?to= ?limit ?offset. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const iso = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
  const from = iso(sp.get("from"));
  const to = iso(sp.get("to"));

  let q = createAdminClient().from("rider_settlements").select("*").eq("restaurant_id", session.restaurantId);
  const riderId = sp.get("riderId");
  if (riderId) q = q.eq("rider_employee_id", riderId);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
  if (error) return NextResponse.json({ error: isMissingRiderColumn(error) ? RIDER_MIGRATION_WARNING : error.message }, { status: 500 });
  const rows = data ?? [];
  return NextResponse.json({ settlements: rows.slice(0, limit), hasMore: rows.length > limit });
}
