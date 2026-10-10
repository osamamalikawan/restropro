import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

const STALE_MS = 20 * 60 * 60 * 1000; // an open shift older than this was forgotten (see lib/shifts.ts)

type Row = { clock_in_at: string; clock_out_at: string | null; status: string };

/** The time window of "the current shift", for the Accounts "Current shift" filter.
 *  - someone is clocked in      -> kind "current":  from the earliest clock-in among those on shift, no end (still running)
 *  - nobody is clocked in       -> kind "previous": the shift that ended last (shifts that overlapped it count as one)
 *  - no shift records at all    -> kind "none":     the caller falls back to the calendar day
 *  Returns ISO instants: { kind, from, to } (to is null while the shift is still running). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("staff_shifts")
    .select("clock_in_at, clock_out_at, status")
    .eq("restaurant_id", session.restaurantId)
    .gte("clock_in_at", since)
    .in("status", ["open", "closed"])
    .order("clock_in_at", { ascending: false })
    .limit(500);
  // before migration 0023 (or on any read problem) just let the page use the calendar day
  if (error) return NextResponse.json({ kind: "none", from: null, to: null });

  const rows = (data ?? []) as Row[];
  const now = Date.now();

  const open = rows.filter((r) => r.status === "open" && now - Date.parse(r.clock_in_at) < STALE_MS);
  if (open.length) {
    const from = Math.min(...open.map((r) => Date.parse(r.clock_in_at)));
    return NextResponse.json({ kind: "current", from: new Date(from).toISOString(), to: null });
  }

  const closed = rows.filter((r) => r.status === "closed" && r.clock_out_at);
  if (!closed.length) return NextResponse.json({ kind: "none", from: null, to: null });

  // the shift that ended last, widened to include every shift that overlapped it
  const last = closed.reduce((a, b) => (Date.parse(b.clock_out_at!) > Date.parse(a.clock_out_at!) ? b : a));
  let from = Date.parse(last.clock_in_at);
  let to = Date.parse(last.clock_out_at!);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of closed) {
      const a = Date.parse(r.clock_in_at);
      const b = Date.parse(r.clock_out_at!);
      if (a <= to && b >= from && (a < from || b > to)) {
        from = Math.min(from, a);
        to = Math.max(to, b);
        grew = true;
      }
    }
  }
  return NextResponse.json({ kind: "previous", from: new Date(from).toISOString(), to: new Date(to).toISOString() });
}
