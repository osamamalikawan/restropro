-- =====================================================================
-- RESTRO PRO - Supabase migration 0021
-- 1) Urdu item names: products.name_ur holds the Urdu name next to the English `name`.
--    The POS, kitchen slip and invoice use it when Settings -> "Show item names in Urdu" is on.
-- 2) Category colours: menu_categories.color is an optional #RRGGBB. NULL = use the theme colour.
-- 3) restaurant_settings.urdu_enabled is the on/off switch (off by default).
-- Safe to run twice.
-- =====================================================================
alter table public.products add column if not exists name_ur text;

alter table public.menu_categories add column if not exists color text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_categories_color_hex') then
    alter table public.menu_categories
      add constraint menu_categories_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

alter table public.restaurant_settings add column if not exists urdu_enabled boolean not null default false;

notify pgrst, 'reload schema';
