import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** One row per tenant. Created with defaults on first access if it doesn't exist yet
 *  (a restaurant activated before this migration existed won't have one). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  let { data: settings } = await admin
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .single();

  if (!settings) {
    const { data: created, error } = await admin
      .from("restaurant_settings")
      .insert({ restaurant_id: session.restaurantId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = created;
  }

  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Only Admin can change settings" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    taxRate?: number;
    serviceChargeRate?: number;
    printerName?: string;
    paperWidth?: string;
    receiptHeader?: string;
    receiptFooter?: string;
  };

  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_settings").upsert({
    restaurant_id: session.restaurantId,
    tax_rate: body.taxRate,
    service_charge_rate: body.serviceChargeRate,
    printer_name: body.printerName,
    paper_width: body.paperWidth,
    receipt_header: body.receiptHeader,
    receipt_footer: body.receiptFooter,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
