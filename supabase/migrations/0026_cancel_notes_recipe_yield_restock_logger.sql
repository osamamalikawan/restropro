-- =====================================================================
-- RESTRO PRO - Supabase migration 0026
--   1. sales.cancelled_stage / cancel_note / cancelled_at / cancelled_by_name - at which kitchen stage an order was
--      cancelled (active / preparing / completed) and the reason. A reason is mandatory when a Completed order is cancelled.
--   2. inventory_items.recipe_yield - the batch size (final product weight) a self-made item's recipe makes. The
--      recipe ingredients are entered for the whole batch; production_recipe_items keeps them per 1 unit (batch qty / yield),
--      which is what log_production() already multiplies by.
--   3. stock_purchases.logged_by_name - who logged a restock purchase (shown in the Restock history's "Logged by").
-- Safe to run twice.
-- =====================================================================
alter table public.sales add column if not exists cancelled_stage text;
alter table public.sales add column if not exists cancel_note text;
alter table public.sales add column if not exists cancelled_at timestamptz;
alter table public.sales add column if not exists cancelled_by_name text;

alter table public.inventory_items add column if not exists recipe_yield numeric(14, 4);

alter table public.stock_purchases add column if not exists logged_by_name text;

notify pgrst, 'reload schema';
