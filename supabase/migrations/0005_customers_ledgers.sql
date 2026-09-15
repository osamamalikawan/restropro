-- =====================================================================
-- RESTRO PRO — Supabase migration 0005
-- Customers (+ linked into checkout atomically), Employee Ledger, Supplier Ledger.
-- =====================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  phone text not null,
  address text,
  area_id uuid references delivery_areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, phone)
);
create index ix_customers_restaurant on customers(restaurant_id);

alter table sales add column customer_id uuid references customers(id);

create table employee_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('salary','advance','bonus','deduction')),
  amount numeric(12,2) not null,
  note text,
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_employee_ledger_restaurant on employee_ledger(restaurant_id, txn_date desc);

create table supplier_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null default 'Cash',
  note text,
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_supplier_ledger_restaurant on supplier_ledger(restaurant_id, txn_date desc);

alter table customers enable row level security;
alter table employee_ledger enable row level security;
alter table supplier_ledger enable row level security;
create policy customers_super_admin_read on customers for select using (is_super_admin());
create policy employee_ledger_super_admin_read on employee_ledger for select using (is_super_admin());
create policy supplier_ledger_super_admin_read on supplier_ledger for select using (is_super_admin());

-- ---------------------------------------------------------------
-- Atomic ledger payments: log the payment AND book the matching accounts expense entry in
-- one transaction, same rationale as create_sale()/log_restock().
-- ---------------------------------------------------------------
create or replace function log_employee_payment(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_type text,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
as $$
declare
  v_ledger_id uuid;
  v_employee_name text;
begin
  insert into employee_ledger (restaurant_id, employee_id, type, amount, note)
  values (p_restaurant_id, p_employee_id, p_type, p_amount, p_note)
  returning id into v_ledger_id;

  select name into v_employee_name from employees where id = p_employee_id;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount)
  values (p_restaurant_id, current_date, initcap(p_type) || ' — ' || coalesce(v_employee_name, 'employee'), 'Salaries', 'expense', p_amount);

  return v_ledger_id;
end;
$$;

create or replace function log_supplier_payment(
  p_restaurant_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_method text default 'Cash',
  p_note text default null
) returns uuid
language plpgsql
as $$
declare
  v_ledger_id uuid;
  v_supplier_name text;
begin
  insert into supplier_ledger (restaurant_id, supplier_id, amount, method, note)
  values (p_restaurant_id, p_supplier_id, p_amount, p_method, p_note)
  returning id into v_ledger_id;

  select name into v_supplier_name from suppliers where id = p_supplier_id;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount)
  values (p_restaurant_id, current_date, 'Supplier payment — ' || coalesce(v_supplier_name, 'supplier'), 'Supplier payment', 'expense', p_amount);

  return v_ledger_id;
end;
$$;

-- ---------------------------------------------------------------
-- Extend create_sale() to link (or atomically create-by-phone) a customer.
-- Phone stays unique per tenant: if a phone is passed and it already belongs to an existing
-- customer, that customer is reused rather than erroring or duplicating.
-- ---------------------------------------------------------------
create or replace function create_sale(
  p_restaurant_id uuid,
  p_cashier_employee_id uuid,
  p_order_type text,
  p_items jsonb,
  p_payments jsonb,
  p_tax_rate numeric default 0.05,
  p_table_id uuid default null,
  p_area_id uuid default null,
  p_delivery_charge numeric default 0,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_address text default null
) returns table(order_no int, total numeric)
language plpgsql
as $$
declare
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_order_no int;
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_recipe record;
  v_customer_id uuid := p_customer_id;
begin
  if v_customer_id is null and p_customer_phone is not null and p_customer_phone <> '' then
    select id into v_customer_id from customers where restaurant_id = p_restaurant_id and phone = p_customer_phone;
    if v_customer_id is null then
      insert into customers (restaurant_id, name, phone, address, area_id)
      values (p_restaurant_id, coalesce(nullif(p_customer_name, ''), 'Walk-in Customer'), p_customer_phone, p_customer_address, p_area_id)
      returning id into v_customer_id;
    end if;
  end if;

  select coalesce(sum((elem->>'price')::numeric * (elem->>'qty')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) elem;

  v_tax := round(v_subtotal * p_tax_rate);
  v_total := v_subtotal + v_tax + coalesce(p_delivery_charge, 0);

  select coalesce(sum((elem->>'amount')::numeric), 0) into v_paid
    from jsonb_array_elements(p_payments) elem;

  if v_paid < v_total then
    raise exception 'Payment (%) is less than the total (%)', v_paid, v_total;
  end if;

  select coalesce(max(s.order_no), 1000) + 1 into v_order_no
    from sales s where s.restaurant_id = p_restaurant_id;

  insert into sales (restaurant_id, order_no, order_type, cashier_employee_id, subtotal, tax, total, status, table_id, area_id, delivery_charge, customer_id)
  values (p_restaurant_id, v_order_no, p_order_type, p_cashier_employee_id, v_subtotal, v_tax, v_total, 'completed', p_table_id, p_area_id, coalesce(p_delivery_charge, 0), v_customer_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (sale_id, product_id, name, unit_price, quantity)
    values (v_sale_id, (v_item->>'productId')::uuid, v_item->>'name', (v_item->>'price')::numeric, (v_item->>'qty')::numeric);

    for v_recipe in
      select inventory_item_id, quantity from recipe_items where product_id = (v_item->>'productId')::uuid
    loop
      update inventory_items
        set current_stock = greatest(0, current_stock - v_recipe.quantity * (v_item->>'qty')::numeric),
            updated_at = now()
        where id = v_recipe.inventory_item_id;
    end loop;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into sale_payments (sale_id, method, amount)
    values (v_sale_id, v_payment->>'method', (v_payment->>'amount')::numeric);
  end loop;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount)
  values (p_restaurant_id, current_date, 'POS sale #' || v_order_no, 'Sales', 'income', v_total);

  return query select v_order_no, v_total;
end;
$$;
