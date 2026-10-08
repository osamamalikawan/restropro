-- =====================================================================
-- RESTRO PRO - Supabase migration 0023
-- Clock in / clock out records. A row is opened when staff sign in (PIN) and closed when they
-- "Clock out" - at that moment the shift's figures are frozen into the row so the Shift Records
-- page stays correct even if orders or expenses are edited later. Safe to run twice.
--   status: open (still clocked in) | closed (clocked out) | abandoned (never clocked out - the
--           next sign-in closed it without a summary).
-- =====================================================================
create table if not exists public.staff_shifts (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  employee_id      uuid not null,
  employee_name    text,
  clock_in_at      timestamptz not null default now(),
  clock_out_at     timestamptz,
  status           text not null default 'open' check (status in ('open', 'closed', 'abandoned')),
  duration_minutes integer,
  orders_count     integer,
  sales_amount     numeric(14, 2),
  cash_amount      numeric(14, 2),
  other_amount     numeric(14, 2),            -- everything paid by Card / JazzCash / Easypaisa / bank ...
  other_breakdown  jsonb,                     -- [{ "method": "JazzCash", "amount": 1200 }, ...]
  unpaid_amount    numeric(14, 2),
  expenses_amount  numeric(14, 2),
  created_at       timestamptz not null default now()
);

create index if not exists staff_shifts_restaurant_clock_in_idx on public.staff_shifts (restaurant_id, clock_in_at desc);
create index if not exists staff_shifts_employee_status_idx on public.staff_shifts (employee_id, status);

-- Only the server (service role) reads and writes this table.
alter table public.staff_shifts enable row level security;

notify pgrst, 'reload schema';
