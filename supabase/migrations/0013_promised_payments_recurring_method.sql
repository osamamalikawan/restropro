-- =====================================================================
-- RESTRO PRO — Supabase migration 0013
-- 1. Recurring expenses no longer store a fixed payment_method — it's chosen at the moment
--    a due one is confirmed instead (cash today, bank transfer next month, etc.).
-- 2. Supplier "promised payments" — a one-time commitment to pay a supplier a given amount
--    on a future date, with the same due → confirm-to-log pattern as recurring expenses,
--    but NOT repeating (a promise is resolved once: paid or cancelled).
-- =====================================================================

alter table recurring_expenses alter column payment_method drop not null;
alter table recurring_expenses alter column payment_method drop default;
-- Column is kept (nullable, unused) rather than dropped outright — cheaper/safer than a
-- destructive DROP COLUMN, and avoids breaking anything still selecting it by name.

create or replace function confirm_recurring_expense(p_id uuid, p_restaurant_id uuid, p_log boolean, p_payment_method text default null)
returns table(next_due_date date, logged boolean)
language plpgsql
as $$
declare
  v_row recurring_expenses%rowtype;
  v_next date;
begin
  select * into v_row from recurring_expenses where id = p_id and restaurant_id = p_restaurant_id;
  if v_row.id is null then
    raise exception 'Recurring expense not found';
  end if;

  if p_log then
    if p_payment_method is null or p_payment_method = '' then
      raise exception 'Select a payment method to log this payment';
    end if;
    perform log_expense(
      p_restaurant_id := p_restaurant_id,
      p_category := v_row.category,
      p_expense_type := 'recurring',
      p_amount := v_row.amount,
      p_vendor := v_row.vendor,
      p_description := v_row.description,
      p_payment_method := p_payment_method
    );
  end if;

  v_next := recurring_expense_next_date(v_row.next_due_date, v_row.frequency);
  update recurring_expenses set next_due_date = v_next, updated_at = now() where id = p_id;

  return query select v_next, p_log;
end;
$$;

-- ---------------------------------------------------------------
-- SUPPLIER PROMISED PAYMENTS
-- ---------------------------------------------------------------
create table if not exists supplier_promised_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  promised_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_supplier_promised_payments_restaurant on supplier_promised_payments(restaurant_id);
create index if not exists ix_supplier_promised_payments_due on supplier_promised_payments(restaurant_id, promised_date) where status = 'pending';

alter table supplier_promised_payments enable row level security;
drop policy if exists supplier_promised_payments_super_admin_read on supplier_promised_payments;
create policy supplier_promised_payments_super_admin_read on supplier_promised_payments for select using (is_super_admin());

-- p_pay=true logs the payment now (via the existing log_supplier_payment(), same one the
-- ledger's own "Log a payment" form uses) and marks the promise 'paid'. p_pay=false marks
-- it 'cancelled' without logging anything — a promise is resolved once, it doesn't
-- reschedule itself like a recurring expense does.
create or replace function confirm_promised_payment(p_id uuid, p_restaurant_id uuid, p_pay boolean, p_method text default null)
returns void
language plpgsql
as $$
declare
  v_row supplier_promised_payments%rowtype;
begin
  select * into v_row from supplier_promised_payments where id = p_id and restaurant_id = p_restaurant_id;
  if v_row.id is null then
    raise exception 'Promised payment not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This promise has already been resolved';
  end if;

  if p_pay then
    if p_method is null or p_method = '' then
      raise exception 'Select a payment method to log this payment';
    end if;
    perform log_supplier_payment(
      p_restaurant_id := p_restaurant_id,
      p_supplier_id := v_row.supplier_id,
      p_amount := v_row.amount,
      p_method := p_method,
      p_note := v_row.note
    );
    update supplier_promised_payments set status = 'paid', updated_at = now() where id = p_id;
  else
    update supplier_promised_payments set status = 'cancelled', updated_at = now() where id = p_id;
  end if;
end;
$$;
