-- =====================================================================
-- RESTRO PRO — Supabase migration
-- Recurring expenses: a template (category, amount, frequency, next due date) rather than a
-- one-off logged row. Confirming a due one calls the EXISTING log_expense() function — same
-- one /api/expenses already uses for regular one-off entries — so recurring payments land in
-- the same expenses/accounts trail, just tagged expense_type='recurring' like they already
-- could be. This migration only adds new objects; it doesn't touch expenses/log_expense at
-- all, since the current schema's exact definition isn't available locally right now (the
-- baseline dump came back empty — see the app's chat history / ask me to help re-pull it).
-- =====================================================================

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  vendor text,
  description text,
  payment_method text not null default 'Cash',
  frequency text not null check (frequency in ('daily','weekly','fortnightly','monthly','yearly')),
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_recurring_expenses_restaurant on recurring_expenses(restaurant_id);
create index if not exists ix_recurring_expenses_due on recurring_expenses(restaurant_id, next_due_date) where is_active;

alter table recurring_expenses enable row level security;
drop policy if exists recurring_expenses_super_admin_read on recurring_expenses;
create policy recurring_expenses_super_admin_read on recurring_expenses for select using (is_super_admin());

-- ---------------------------------------------------------------
-- recurring_expense_next_date(): daily/weekly/fortnightly/monthly/yearly → the next date
-- after `d`. Always steps from the PREVIOUS due date, not from today, so a payment
-- confirmed a few days late doesn't shift the whole schedule forward (rent stays due on
-- the 1st even if you confirm it on the 3rd).
-- ---------------------------------------------------------------
create or replace function recurring_expense_next_date(d date, freq text) returns date
language sql
immutable
as $$
  select case freq
    when 'daily' then d + interval '1 day'
    when 'weekly' then d + interval '7 days'
    when 'fortnightly' then d + interval '14 days'
    when 'monthly' then d + interval '1 month'
    when 'yearly' then d + interval '1 year'
    else d + interval '1 month'
  end::date;
$$;

-- ---------------------------------------------------------------
-- confirm_recurring_expense(): the confirmation-dialog action. p_log=true logs today's
-- payment (via the existing log_expense()) and advances the schedule; p_log=false just
-- advances the schedule without logging anything ("skip this occurrence").
-- ---------------------------------------------------------------
create or replace function confirm_recurring_expense(p_id uuid, p_restaurant_id uuid, p_log boolean)
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
    perform log_expense(
      p_restaurant_id := p_restaurant_id,
      p_category := v_row.category,
      p_expense_type := 'recurring',
      p_amount := v_row.amount,
      p_vendor := v_row.vendor,
      p_description := v_row.description,
      p_payment_method := v_row.payment_method
    );
  end if;

  v_next := recurring_expense_next_date(v_row.next_due_date, v_row.frequency);
  update recurring_expenses set next_due_date = v_next, updated_at = now() where id = p_id;

  return query select v_next, p_log;
end;
$$;
