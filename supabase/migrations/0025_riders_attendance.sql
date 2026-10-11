-- =====================================================================
-- RESTRO PRO - Supabase migration 0025
--   1. Delivery riders: employees.is_rider, sales.rider_* (who delivered an order, and whether the rider has
--      handed in the money for it yet) and rider_settlements (one row each time a rider submits a shift's amount).
--   2. Attendance: attendance_records - clock in / clock out for ANY employee (not only app users), with the
--      minutes worked. Staff who sign in to the app are recorded here automatically too.
-- Safe to run twice.
-- =====================================================================

-- ---- riders ---------------------------------------------------------
alter table public.employees add column if not exists is_rider boolean not null default false;

create table if not exists public.rider_settlements (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  rider_employee_id uuid not null,
  rider_name        text,
  orders_count      integer not null default 0,
  orders_amount     numeric(14, 2) not null default 0,   -- value of all the orders handed in
  expected_amount   numeric(14, 2) not null default 0,   -- cash the rider should hand over (the unpaid part of those orders)
  submitted_amount  numeric(14, 2) not null default 0,   -- what the rider actually handed over
  difference        numeric(14, 2) not null default 0,   -- submitted - expected (negative = short)
  note              text,
  received_by_employee_id uuid,
  received_by_name  text,
  created_at        timestamptz not null default now()
);
create index if not exists rider_settlements_restaurant_idx on public.rider_settlements (restaurant_id, created_at desc);
create index if not exists rider_settlements_rider_idx on public.rider_settlements (rider_employee_id, created_at desc);
alter table public.rider_settlements enable row level security;

alter table public.sales add column if not exists rider_employee_id uuid;
alter table public.sales add column if not exists rider_assigned_at timestamptz;
alter table public.sales add column if not exists rider_settlement_id uuid;   -- set once the rider has submitted this order's money
create index if not exists sales_rider_idx on public.sales (restaurant_id, rider_employee_id) where rider_employee_id is not null;

-- ---- time zone for the shift timings ----------------------------------
-- Shift start/end (Permissions page) are clock times; this says which clock: minutes ahead of UTC (Pakistan = 300).
alter table public.restaurant_settings add column if not exists utc_offset_minutes integer not null default 300;

-- ---- attendance -----------------------------------------------------
create table if not exists public.attendance_records (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  employee_id    uuid not null,
  employee_name  text,
  clock_in_at    timestamptz not null default now(),
  clock_out_at   timestamptz,
  status         text not null default 'open' check (status in ('open', 'closed')),
  minutes        integer,                       -- worked minutes, filled in when the record closes
  source         text not null default 'manual' check (source in ('manual', 'app')),
  auto_closed    boolean not null default false, -- true when the system clocked them out at the end of the shift
  tz_offset      integer not null default 0,     -- minutes ahead of UTC where it was marked (used to find the shift end)
  note           text,
  marked_by_name text,
  created_at     timestamptz not null default now()
);
create index if not exists attendance_restaurant_idx on public.attendance_records (restaurant_id, clock_in_at desc);
create index if not exists attendance_employee_idx on public.attendance_records (employee_id, clock_in_at desc);
create index if not exists attendance_open_idx on public.attendance_records (restaurant_id, status) where status = 'open';
alter table public.attendance_records enable row level security;

notify pgrst, 'reload schema';
