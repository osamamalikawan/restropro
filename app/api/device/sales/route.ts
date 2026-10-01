import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth/require-device";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

type OfflineSale = {
  clientSaleId: string;
  cashierEmployeeId: string;
  soldAt?: string;
  orderType: string;
  items: { productId: string; name: string; price: number; qty: number }[];
  payments?: { method: string; amount: number }[];
  taxMethod?: string;
  tableId?: string | null;
  areaId?: string | null;
  deliveryCharge?: number;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
};

type SaleResult =
  | { clientSaleId: string; ok: true; orderNo: number | string; total: number; status: string; balance: number; duplicate?: boolean }
  | { clientSaleId: string; ok: false; error: string; retryable: boolean };

const MAX_BATCH = 50;
const BACKDATE_LIMIT_MS = 4 * 24 * 60 * 60 * 1000; // devices must sync every 3 days; small margin on top
const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Upload of sales rung up while the desktop was offline. Same business logic as POST
 *  /api/sales (tax rate from settings, atomic create_sale RPC) but authenticated by device
 *  token + the cashier's employee id, and idempotent on clientSaleId. Returns one result per
 *  sale so the device can mark each as synced / rejected independently. */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { restaurantId, deviceId } = auth.device;

  const body = (await req.json().catch(() => ({}))) as { sales?: OfflineSale[] };
  const sales = body.sales;
  if (!Array.isArray(sales) || sales.length === 0 || sales.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_BATCH} sales` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: st } = await admin.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();

  const cashierCache = new Map<string, { ok: boolean; reason?: string }>();
  async function cashierAllowed(employeeId: string) {
    const hit = cashierCache.get(employeeId);
    if (hit) return hit;
    const { data: emp } = await admin
      .from("employees")
      .select("role, status")
      .eq("id", employeeId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    let res: { ok: boolean; reason?: string };
    if (!emp) res = { ok: false, reason: "Cashier not found for this restaurant" };
    else if (!(await hasModuleAccess(restaurantId, emp.role, "pos"))) res = { ok: false, reason: "Cashier is not permitted to use the POS" };
    else res = { ok: true }; // status is not enforced: a sale already rung up offline must not be lost because the employee was deactivated since
    cashierCache.set(employeeId, res);
    return res;
  }

  const results: SaleResult[] = [];
  for (const s of sales) {
    const id = typeof s?.clientSaleId === "string" ? s.clientSaleId : "";
    const reject = (error: string, retryable = false) => results.push({ clientSaleId: id, ok: false, error, retryable });

    if (!id || id.length > 100) { reject("Missing clientSaleId"); continue; }
    if (!Array.isArray(s.items) || s.items.length === 0) { reject("Order must have at least one item"); continue; }
    if (!["dine_in", "takeaway", "delivery"].includes(s.orderType)) { reject("Invalid order type"); continue; }
    if (!s.cashierEmployeeId) { reject("Missing cashier"); continue; }

    const who = await cashierAllowed(s.cashierEmployeeId);
    if (!who.ok) { reject(who.reason ?? "Not permitted"); continue; }

    // Claim the id first. A unique-violation means this sale was already uploaded (or is in flight).
    const { error: claimError } = await admin
      .from("device_sale_receipts")
      .insert({ restaurant_id: restaurantId, client_sale_id: id, device_id: deviceId });
    if (claimError) {
      const { data: prior } = await admin
        .from("device_sale_receipts")
        .select("result, created_at")
        .eq("restaurant_id", restaurantId)
        .eq("client_sale_id", id)
        .maybeSingle();
      if (prior?.result) {
        results.push({ clientSaleId: id, ok: true, duplicate: true, ...(prior.result as { orderNo: number | string; total: number; status: string; balance: number }) });
      } else if (prior && Date.now() - new Date(prior.created_at).getTime() < STALE_CLAIM_MS) {
        reject("This sale is still being processed — retrying shortly", true);
      } else {
        reject("Could not confirm whether this sale was saved. Check Sales on the web app before re-entering it.");
      }
      continue;
    }

    const payments = s.payments ?? [];
    const method = [...payments].sort((a, c) => c.amount - a.amount)[0]?.method ?? s.taxMethod ?? "Cash";
    const legacy = st?.tax_rate != null ? Number(st.tax_rate) : 5;
    const pct = /cash/i.test(method)
      ? st?.cash_tax_rate != null ? Number(st.cash_tax_rate) : legacy
      : st?.card_tax_rate != null ? Number(st.card_tax_rate) : legacy;

    const { data, error } = await admin.rpc("create_sale", {
      p_restaurant_id: restaurantId,
      p_cashier_employee_id: s.cashierEmployeeId,
      p_order_type: s.orderType,
      p_items: s.items,
      p_payments: payments,
      p_tax_rate: pct / 100,
      p_table_id: s.tableId || null,
      p_area_id: s.areaId || null,
      p_delivery_charge: s.orderType === "delivery" ? s.deliveryCharge ?? 0 : 0,
      p_customer_id: s.customerId || null,
      p_customer_name: s.customerName || null,
      p_customer_phone: s.customerPhone || null,
      p_customer_address: s.customerAddress || null,
    });

    if (error) {
      // Release the claim so the cashier can fix the cause (e.g. stock) and retry the same sale.
      await admin.from("device_sale_receipts").delete().eq("restaurant_id", restaurantId).eq("client_sale_id", id);
      reject(error.message);
      continue;
    }

    const r = Array.isArray(data) ? data[0] : data;
    const result = { orderNo: r.order_no, total: r.total, status: r.status, balance: r.balance ?? 0 };
    await admin.from("device_sale_receipts").update({ result }).eq("restaurant_id", restaurantId).eq("client_sale_id", id);

    // Keep the real sale time for reports (create_sale stamps "now"). Best effort, clamped.
    const soldAt = s.soldAt ? new Date(s.soldAt).getTime() : NaN;
    if (Number.isFinite(soldAt) && soldAt <= Date.now() && Date.now() - soldAt <= BACKDATE_LIMIT_MS) {
      await admin
        .from("sales")
        .update({ created_at: new Date(soldAt).toISOString() })
        .eq("restaurant_id", restaurantId)
        .eq("order_no", r.order_no);
    }

    results.push({ clientSaleId: id, ok: true, ...result });
  }

  return NextResponse.json({ results });
}
