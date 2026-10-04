-- =====================================================================
-- RESTRO PRO - Supabase migration 0017
-- 1. Discounts: sales.discount_amount / discount_percent, and an admin switch
--    restaurant_settings.show_discount (Settings -> POS controls) that hides the discount
--    field in the checkout popup.
-- 2. Order instructions + item notes: sales.order_note, sales.item_notes (json list of
--    {productId, name, note}) and restaurant_settings.note_presets (the quick-note chips shown
--    when a cashier taps an item in the order panel; the owner edits and orders them in Settings).
-- 3. Device-based order IDs: every activated desktop device gets a short number (devices.device_no,
--    1, 2, 3 ... per restaurant). A sale made on it is labelled D<device_no>-<counter>, for example
--    D2-0045 (stored in sales.display_id). The counter only ever grows on that one device, so
--    offline sales from several devices can never collide. Safe to run twice.
-- =====================================================================

alter table public.sales add column if not exists discount_amount numeric not null default 0;
alter table public.sales add column if not exists discount_percent numeric not null default 0;
alter table public.sales add column if not exists order_note text;
alter table public.sales add column if not exists item_notes jsonb not null default '[]'::jsonb;
alter table public.sales add column if not exists display_id text;
alter table public.sales add column if not exists device_id uuid;
alter table public.sales add column if not exists device_seq bigint;

alter table public.restaurant_settings add column if not exists show_discount boolean not null default true;
alter table public.restaurant_settings add column if not exists note_presets jsonb not null default '["Extra spicy","No vegetables","Extra mayo","No onion"]'::jsonb;

alter table public.devices add column if not exists device_no integer;

-- number the devices that already exist (oldest first, per restaurant)
update public.devices d set device_no = r.rn
  from (select id, row_number() over (partition by restaurant_id order by created_at, id) as rn from public.devices) r
  where r.id = d.id and d.device_no is null;

-- new devices get the next number automatically
create or replace function public.assign_device_no() returns trigger language plpgsql as $$
begin
  if new.device_no is null then
    select coalesce(max(device_no), 0) + 1 into new.device_no from public.devices where restaurant_id = new.restaurant_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_assign_device_no on public.devices;
create trigger trg_assign_device_no before insert on public.devices for each row execute function public.assign_device_no();

create unique index if not exists devices_restaurant_device_no_key on public.devices (restaurant_id, device_no);
-- the same device can never use the same counter twice
create unique index if not exists sales_device_seq_key on public.sales (device_id, device_seq) where device_id is not null;
create unique index if not exists sales_display_id_key on public.sales (restaurant_id, display_id) where display_id is not null;

notify pgrst, 'reload schema';
