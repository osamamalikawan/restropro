-- =====================================================================
-- RESTRO PRO - Supabase migration 0022
-- Urdu category names: menu_categories.name_ur holds the Urdu name next to the English `name`.
-- The POS category tabs use it when Settings -> "Show item & category names in Urdu" is on
-- (the same switch that turns on Urdu item names - restaurant_settings.urdu_enabled, migration 0021).
-- Categories without an Urdu name keep their English name. Safe to run twice.
-- =====================================================================
alter table public.menu_categories add column if not exists name_ur text;

notify pgrst, 'reload schema';
