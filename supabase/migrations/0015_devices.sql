-- =====================================================================
-- RESTRO PRO — Supabase migration 0015
-- Desktop (Tauri) POS devices.
-- 1. `devices`: one row per activated desktop install. Only the SHA-256 hash of the
--    long-lived device token is stored (the token itself lives in the OS keychain on the
--    device). Setting revoked_at cuts a device off at its next sync.
-- 2. `device_sale_receipts`: idempotency ledger for sales rung up offline and uploaded
--    later. (restaurant_id, client_sale_id) is claimed BEFORE create_sale() runs, so a
--    retry after a timeout / dropped connection can never create the sale twice.
-- Both tables are service-role only (RLS on, no policies except super-admin read).
-- =====================================================================

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ix_devices_restaurant on devices(restaurant_id);

alter table devices enable row level security;
drop policy if exists devices_super_admin_read on devices;
create policy devices_super_admin_read on devices for select using (is_super_admin());

create table if not exists device_sale_receipts (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  client_sale_id text not null,
  device_id uuid references devices(id) on delete set null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, client_sale_id)
);

alter table device_sale_receipts enable row level security;
drop policy if exists device_sale_receipts_super_admin_read on device_sale_receipts;
create policy device_sale_receipts_super_admin_read on device_sale_receipts for select using (is_super_admin());
