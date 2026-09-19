-- =====================================================================
-- RESTRO PRO — Supabase migration 0007
-- Users & Permissions (per-tenant editable role→module matrix + default shift timing),
-- Settings (expense categories, split cash/card tax, POS button visibility, printer
-- connection + FBR stub) — ports the remaining config surfaces from the HTML prototype
-- that the fixed role enum + static restaurant_settings columns didn't cover yet.
-- =====================================================================

-- ---------------------------------------------------------------
-- ROLE PERMISSIONS — one row per (restaurant, role, module). Seeded lazily on first read
-- (see lib/permissions.ts) from the same defaults the prototype ships with
-- (scripts/data/seed-data.js ADMIN/MANAGER/CASHIER/INVENTORY_PERMS), rather than a
-- migration-time INSERT, so existing tenants get the defaults the first time anyone opens
-- the Users & Permissions page instead of needing a backfill migration.
-- ---------------------------------------------------------------
create table role_permissions (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null check (role in ('admin','manager','cashier','inventory')),
  module text not null check (module in (
    'dashboard','pos','sales','customers','inventory','restock','products','recipes',
    'suppliers','supplierLedger','employees','employeeLedger','accounts','expenses',
    'menu','tables','settings','admin'
  )),
  can_view boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, role, module)
);
create index ix_role_permissions_restaurant on role_permissions(restaurant_id);

alter table role_permissions enable row level security;
create policy role_permissions_super_admin_read on role_permissions for select using (is_super_admin());

-- ---------------------------------------------------------------
-- EXPENSE CATEGORIES — was a hardcoded list in the frontend; the prototype's Users &
-- Permissions page lets Admin manage this list per tenant, so it needs to be real rows.
-- ---------------------------------------------------------------
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index ix_expense_categories_restaurant on expense_categories(restaurant_id);

alter table expense_categories enable row level security;
create policy expense_categories_super_admin_read on expense_categories for select using (is_super_admin());

-- ---------------------------------------------------------------
-- SETTINGS additions — default shift timing (shown as the sidebar's shift pill and used
-- by Restock's default date), the cash/card tax split, POS button visibility, printer
-- connection type, auto-print, and the FBR digital-invoicing stub — all straight ports of
-- fields the prototype's Settings/Users & Permissions views already read and write.
-- ---------------------------------------------------------------
alter table restaurant_settings add column shift_start time not null default '14:00';
alter table restaurant_settings add column shift_end time not null default '02:00';
alter table restaurant_settings add column cash_tax_rate numeric(5,2) not null default 0;
alter table restaurant_settings add column card_tax_rate numeric(5,2) not null default 0;
alter table restaurant_settings add column pos_show_kitchen_print boolean not null default true;
alter table restaurant_settings add column pos_show_print_invoice boolean not null default true;
alter table restaurant_settings add column connection text not null default 'USB';
alter table restaurant_settings add column auto_print boolean not null default true;
alter table restaurant_settings add column fbr_enabled boolean not null default false;
alter table restaurant_settings add column fbr_ntn text;
alter table restaurant_settings add column fbr_strn text;
alter table restaurant_settings add column fbr_pos_id text;
alter table restaurant_settings add column fbr_api_token text;
alter table restaurant_settings add column fbr_environment text not null default 'sandbox';
alter table restaurant_settings add column fbr_fee numeric(12,2) not null default 1;
