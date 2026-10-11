/** Delivery riders: shared helpers. A delivery sale is assigned to a rider (sales.rider_employee_id); at the end of
 *  their shift the rider hands in the money for everything assigned to them, which is recorded as one
 *  rider_settlements row and stamps those sales (sales.rider_settlement_id) so they are not counted twice. */

export const RIDER_MIGRATION_WARNING = "Delivery riders are not set up yet - run migration 0025_riders_attendance.sql in Supabase.";
export const isMissingRiderColumn = (err: { message?: string } | null | undefined) =>
  !!err?.message && /rider_employee_id|rider_settlement|rider_settlements|is_rider|rider_assigned_at/i.test(err.message);

type PaidSale = { total: number | string; status: string; sale_payments?: { amount: number | string }[] | null };

export const paidOf = (s: PaidSale) => (s.sale_payments ?? []).reduce((t, p) => t + (Number(p.amount) || 0), 0);

/** What the rider still has to bring in for this order: the unpaid part (cash on delivery). Orders that were
 *  already paid in full (card, JazzCash ...) owe nothing. */
export const dueOf = (s: PaidSale) => (s.status === "unpaid" ? Math.max((Number(s.total) || 0) - paidOf(s), 0) : 0);

export const round2 = (n: number) => Math.round(n * 100) / 100;
