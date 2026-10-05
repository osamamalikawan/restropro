-- =====================================================================
-- RESTRO PRO - Supabase migration 0018
-- "Remove" on a product or deal no longer deletes the row (sales history points at it, so the
-- database refused and the button silently did nothing). It now stamps deleted_at instead; the
-- row stays for old sales and reports, and is hidden everywhere else (Menu, Products, Deals, POS,
-- recipes). Deals are products rows with is_deal = true, so one column covers both. Safe to run twice.
-- =====================================================================
alter table public.products add column if not exists deleted_at timestamptz;
create index if not exists ix_products_restaurant_live on public.products (restaurant_id) where deleted_at is null;
notify pgrst, 'reload schema';
