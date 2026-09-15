import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus } from "@/lib/subscription";

/**
 * Scheduled sweep (see vercel.json for the cron schedule — configured daily). Recomputes and
 * persists every subscription's status so the Super Admin dashboard reflects reality even for
 * restaurants nobody has logged into recently, and fires one grace-period warning notification
 * per subscription (not one per request) via a `grace_notified_at` marker.
 *
 * This does NOT replace request-time enforcement — middleware and /api/staff/login both call
 * computeStatus() directly on every login, so a lapsed subscription is blocked immediately
 * regardless of when this sweep last ran.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("id, restaurant_id, current_period_end, grace_until, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  let notified = 0;

  for (const sub of subs ?? []) {
    const newStatus = computeStatus(sub);
    if (newStatus !== sub.status) {
      await admin.from("subscriptions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", sub.id);
      updated++;

      if (newStatus === "grace") {
        const { data: notif } = await admin
          .from("notifications")
          .insert({
            title: "Your subscription is in its grace period",
            body: "Please renew within 3 days to avoid losing access to Restro Pro.",
            audience: "selected",
          })
          .select("id")
          .single();
        if (notif) {
          await admin.from("notification_recipients").insert({ notification_id: notif.id, restaurant_id: sub.restaurant_id });
          notified++;
        }
      }
      if (newStatus === "expired") {
        await admin.from("restaurants").update({ status: "expired" }).eq("id", sub.restaurant_id);
      }
    }
  }

  return NextResponse.json({ checked: subs?.length ?? 0, updated, notified });
}
