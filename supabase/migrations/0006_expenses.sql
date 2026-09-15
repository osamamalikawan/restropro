-- =====================================================================
-- RESTRO PRO — Supabase migration 0006
-- Expenses (regular/recurring), atomic with its accounts entry — same pattern as
-- log_restock()/log_employee_payment()/log_supplier_payment().
-- =====================================================================

create table expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category text not null,
  expense_type text not null default 'regular' check (expense_type in ('regular','recurring')),
  amount numeric(12,2) not null,
  vendor text,
  description text,
  payment_method text not null default 'Cash',
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_expenses_restaurant on expenses(restaurant_id, txn_date desc);

alter table expenses enable row level security;
create policy expenses_super_admin_read on expenses for select using (is_super_admin());

create or replace function log_expense(
  p_restaurant_id uuid,
  p_category text,
  p_expense_type text,
  p_amount numeric,
  p_vendor text default null,
  p_description text default null,
  p_payment_method text default 'Cash'
) returns uuid
language plpgsql
as $$
declare
  v_expense_id uuid;
begin
  insert into expenses (restaurant_id, category, expense_type, amount, vendor, description, payment_method)
  values (p_restaurant_id, p_category, p_expense_type, p_amount, p_vendor, p_description, p_payment_method)
  returning id into v_expense_id;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount)
  values (p_restaurant_id, current_date, coalesce(p_description, p_category), p_category, 'expense', p_amount);

  return v_expense_id;
end;
$$;
