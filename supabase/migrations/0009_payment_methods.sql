-- =====================================================================
-- RESTRO PRO — Supabase migration 0009
-- Payment methods customers can split payment across (Settings page panel) — same shape
-- and lazy-seed pattern as expense_categories (0007), ported from the prototype's
-- tenant.paymentMethods (scripts/data/seed-data.js SEED_PAYMENT_METHODS).
-- =====================================================================
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index ix_payment_methods_restaurant on payment_methods(restaurant_id);

alter table payment_methods enable row level security;
create policy payment_methods_super_admin_read on payment_methods for select using (is_super_admin());
