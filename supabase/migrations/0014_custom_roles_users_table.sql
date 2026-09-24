-- =====================================================================
-- RESTRO PRO — Supabase migration 0014
-- 1. Custom roles: a `roles` table per tenant (4 system roles + admin-creatable custom
--    ones), with the CHECK constraints that pinned employees.role and role_permissions.role
--    to the fixed 4-value enum dropped so a custom role name can actually be assigned and
--    configured in the Users & Permissions matrix. The permission-checking code
--    (lib/permissions.ts) already worked with role as a plain string — only the DB
--    constraints and a couple of hardcoded TypeScript unions needed to change.
-- 2. `users` table: a separate, admin-facing "who has a login" table, linked to employees —
--    kept in sync with employees.pin_hash automatically by a trigger, so there is still only
--    ONE real source of truth for login (pin_hash on employees) and no risk of the two
--    drifting apart. The Users page displays/manages this table but actually grants/revokes
--    access the same way the Employees page already does — through employees.pin_hash.
-- =====================================================================

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index if not exists ix_roles_restaurant on roles(restaurant_id);

alter table roles enable row level security;
drop policy if exists roles_super_admin_read on roles;
create policy roles_super_admin_read on roles for select using (is_super_admin());

-- Drop whatever CHECK constraint currently pins employees.role / role_permissions.role to
-- the fixed 4 values — found by definition rather than by a guessed name, since the exact
-- auto-generated name isn't available locally (see the app's chat history re: the empty
-- baseline dump).
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'employees'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table employees drop constraint %I', con.conname);
  end loop;
end $$;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'role_permissions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%' and pg_get_constraintdef(oid) not ilike '%module%'
  loop
    execute format('alter table role_permissions drop constraint %I', con.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- USERS — linked to employees, kept in sync by trigger rather than maintained by hand from
-- two different places.
-- ---------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null unique references employees(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_users_restaurant on users(restaurant_id);

alter table users enable row level security;
drop policy if exists users_super_admin_read on users;
create policy users_super_admin_read on users for select using (is_super_admin());

create or replace function sync_employee_user() returns trigger
language plpgsql
as $$
begin
  if new.pin_hash is not null then
    insert into users (restaurant_id, employee_id, is_active)
    values (new.restaurant_id, new.id, true)
    on conflict (employee_id) do update set is_active = true, updated_at = now();
  else
    update users set is_active = false, updated_at = now() where employee_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_employee_user on employees;
create trigger trg_sync_employee_user
  after insert or update of pin_hash on employees
  for each row execute function sync_employee_user();

-- Back-fill for employees who already had a pin_hash set before this migration ran (the
-- trigger only fires on future inserts/updates).
insert into users (restaurant_id, employee_id, is_active)
select restaurant_id, id, true from employees where pin_hash is not null
on conflict (employee_id) do nothing;
