import type { SupabaseClient } from "@supabase/supabase-js";

/** Bill extras the POS adds on top of what create_sale() knows about (items + tax + delivery):
 *  the dine-in service charge and the FBR invoicing fee. create_sale() is a database function we
 *  don't change, so they are applied right after it succeeds: the sale's total, its paid/unpaid
 *  status and (when migration 0016 is applied) the two breakdown columns are updated together. */
export type SaleExtras = { serviceCharge?: unknown; fbrFee?: unknown };
export type SaleBase = { orderNo: number | string | null; total: number; status: string; balance: number };

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : 0;
};

export async function applySaleExtras(
  admin: SupabaseClient,
  restaurantId: string,
  base: SaleBase,
  extras: SaleExtras,
  paid: number
): Promise<SaleBase & { saleId: string | null }> {
  const serviceCharge = money(extras.serviceCharge);
  const fbrFee = money(extras.fbrFee);
  const extra = serviceCharge + fbrFee;

  let saleId: string | null = null;
  if (base.orderNo != null && base.orderNo !== "") {
    const { data: row } = await admin
      .from("sales")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("order_no", base.orderNo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    saleId = row?.id ?? null;
  }
  if (extra <= 0 || !saleId) return { ...base, saleId };

  const total = Math.round((Number(base.total) + extra) * 100) / 100;
  const status = base.status === "cancelled" ? base.status : paid + 0.005 >= total ? base.status : "unpaid";
  const patch = { total, status };

  let { error } = await admin.from("sales").update({ ...patch, service_charge: serviceCharge, fbr_fee: fbrFee }).eq("id", saleId);
  if (error) ({ error } = await admin.from("sales").update(patch).eq("id", saleId)); // migration 0016 not applied yet
  if (error) {
    console.error("sale extras not applied", error);
    return { ...base, saleId };
  }
  return { orderNo: base.orderNo, total, status, balance: Math.max(0, Math.round((total - paid) * 100) / 100), saleId };
}

export type CustomerUpdate = { name?: unknown; phone?: unknown; address?: unknown; areaId?: unknown };

/** The cashier edited an existing customer's details in the checkout popup: save them. Never
 *  fails the sale — a rejected update (for example a phone number that belongs to another
 *  customer) is logged and skipped. */
export async function applyCustomerUpdate(admin: SupabaseClient, restaurantId: string, customerId: string | null | undefined, u: CustomerUpdate | undefined) {
  if (!customerId || !u || typeof u !== "object") return;
  const patch: Record<string, unknown> = {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const name = text(u.name, 120);
  const phone = text(u.phone, 40);
  const address = text(u.address, 300);
  if (name) patch.name = name;
  if (phone) patch.phone = phone;
  if (address !== undefined) patch.address = address;
  if (u.areaId === null || typeof u.areaId === "string") patch.area_id = u.areaId || null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await admin.from("customers").update(patch).eq("id", customerId).eq("restaurant_id", restaurantId);
  if (error) console.error("customer update skipped", error.message);
}
