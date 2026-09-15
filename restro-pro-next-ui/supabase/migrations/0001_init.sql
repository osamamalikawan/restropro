-- =====================================================================
-- RESTRO PRO — Supabase migration 0001
-- Run via: supabase db push  (or paste into the SQL editor)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- SUBSCRIPTION PLANS (super-admin managed)
-- ---------------------------------------------------------------
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_price numeric(10,2) not null,
  yearly_price numeric(10,2) not null,
  trial_days int not null default 14,
  max_users int,
  features jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- RESTAURANTS (tenants)
-- ---------------------------------------------------------------
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text not null,
  email text not null unique,
  phone text,
  address text,
  city text,
  country text,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','terminated','expired')),
  plan_id uuid references subscription_plans(id),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  -- captured at signup, consumed (and cleared) the moment super admin activates the tenant
  pending_admin_name text,
  pending_admin_pin_hash text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index ix_restaurants_status on restaurants(status);
create index ix_restaurants_owner on restaurants(owner_user_id);

-- ---------------------------------------------------------------
-- SUBSCRIPTIONS (billing periods; 3-day grace after period end)
-- ---------------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  grace_until timestamptz not null, -- current_period_end + 3 days, set by application code
  status text not null default 'trialing'
    check (status in ('trialing','active','grace','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_subscriptions_restaurant on subscriptions(restaurant_id);
create index ix_subscriptions_status on subscriptions(status);

-- ---------------------------------------------------------------
-- EMPLOYEES (PIN-login staff — NOT Supabase Auth users)
-- ---------------------------------------------------------------
create table employees (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin','manager','cashier','inventory')),
  pin_hash text not null,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  -- bump this to invalidate every existing signed session cookie for this employee at once
  session_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_employees_restaurant on employees(restaurant_id);

-- ---------------------------------------------------------------
-- NOTIFICATIONS (super admin -> one / some / all restaurants)
-- ---------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null check (audience in ('all','selected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  read_at timestamptz,
  unique(notification_id, restaurant_id)
);
create index ix_notif_recipients_restaurant on notification_recipients(restaurant_id, read_at);

-- ---------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  actor_type text not null check (actor_type in ('super_admin','owner','employee','system')),
  actor_id text,
  action text not null,
  entity text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index ix_audit_logs_restaurant on audit_logs(restaurant_id, created_at desc);

-- ---------------------------------------------------------------
-- EXAMPLE OF A SYNCABLE OPERATIONAL TABLE (pattern for POS/inventory/etc.)
-- Every table the offline sync engine touches needs: id, restaurant_id,
-- updated_at, deleted_at (soft delete) so last-write-wins + incremental
-- pull-since-timestamp both work.
-- ---------------------------------------------------------------
-- (employees above already follows this pattern and is what the reference
--  sync implementation in lib/sync.ts targets)

-- ---------------------------------------------------------------
-- is_super_admin(): checked from RLS policies and server code
-- ---------------------------------------------------------------
create table super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_super_admin()
returns boolean language sql stable as $$
  select exists(select 1 from super_admins where user_id = auth.uid());
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Staff (PIN) traffic never talks to Supabase directly — it goes through
-- Next.js server routes using the service-role key, which bypasses RLS by
-- design and does its own tenant check. RLS below only governs what an
-- owner's Supabase-Auth session, or the Super Admin, can see directly.
-- =====================================================================
alter table restaurants enable row level security;
alter table subscriptions enable row level security;
alter table subscription_plans enable row level security;
alter table notifications enable row level security;
alter table notification_recipients enable row level security;
alter table employees enable row level security;
alter table audit_logs enable row level security;

-- restaurants: owner sees/updates only their own row; super admin sees all
create policy restaurants_owner_select on restaurants for select
  using (owner_user_id = auth.uid() or is_super_admin());
create policy restaurants_owner_update on restaurants for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy restaurants_super_admin_all on restaurants for all
  using (is_super_admin()) with check (is_super_admin());

-- subscription_plans: publicly readable (shown on signup page), only super admin writes
create policy plans_public_read on subscription_plans for select using (true);
create policy plans_super_admin_write on subscription_plans for insert with check (is_super_admin());
create policy plans_super_admin_update on subscription_plans for update using (is_super_admin());

-- subscriptions: owner reads their own restaurant's row; super admin all
create policy subs_owner_select on subscriptions for select
  using (exists(select 1 from restaurants r where r.id = subscriptions.restaurant_id and r.owner_user_id = auth.uid()) or is_super_admin());
create policy subs_super_admin_write on subscriptions for all
  using (is_super_admin()) with check (is_super_admin());

-- notifications: super admin manages; recipients readable by the targeted restaurant's owner
create policy notif_super_admin_all on notifications for all
  using (is_super_admin()) with check (is_super_admin());
create policy notif_recipients_owner_select on notification_recipients for select
  using (exists(select 1 from restaurants r where r.id = notification_recipients.restaurant_id and r.owner_user_id = auth.uid()) or is_super_admin());
create policy notif_recipients_owner_update on notification_recipients for update
  using (exists(select 1 from restaurants r where r.id = notification_recipients.restaurant_id and r.owner_user_id = auth.uid()))
  with check (exists(select 1 from restaurants r where r.id = notification_recipients.restaurant_id and r.owner_user_id = auth.uid()));
create policy notif_recipients_super_admin_write on notification_recipients for insert with check (is_super_admin());

-- employees: no direct client access at all — service role (server) only.
create policy employees_super_admin_read on employees for select using (is_super_admin());

-- audit_logs: super admin only
create policy audit_super_admin_read on audit_logs for select using (is_super_admin());

-- seed a couple of demo plans
insert into subscription_plans (name, monthly_price, yearly_price, trial_days, max_users, features) values
  ('Starter', 6900, 69000, 14, 5, '["POS","Inventory","Basic Reports"]'),
  ('Professional', 14900, 149000, 14, 20, '["POS","Inventory","Recipes","Ledgers","Reports"]'),
  ('Enterprise', 29900, 299000, 30, null, '["Everything","Priority Support","Multi-branch"]');
