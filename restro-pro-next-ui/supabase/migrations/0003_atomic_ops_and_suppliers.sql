-- =====================================================================
-- RESTRO PRO — Supabase migration 0003
-- 1. create_sale(): wraps checkout in one atomic Postgres function instead of several
--    sequential JS calls (fixes the transaction-safety gap flagged in README.md).
-- 2. suppliers + stock_purchases (Restock) tables.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. ATOMIC CHECKOUT
-- ---------------------------------------------------------------
create or replace function create_sale(
  p_restaurant_id uuid,
  p_cashier_employee_id uuid,
  p_order_type text,
  p_items jsonb,     -- [{"productId": "...", "name": "...", "price": 100, "qty": 2}, ...]
  p_payments jsonb,  -- [{"method": "Cash", "amount": 210}, ...]
  p_tax_rate numeric default 0.05
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
begin
  select coalesce(sum((elem->>'price')::numeric * (elem->>'qty')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) elem;

  v_tax := round(v_subtotal * p_tax_rate);
  v_total := v_subtotal + v_tax;

  select coalesce(sum((elem->>'amount')::numeric), 0) into v_paid
    from jsonb_array_elements(p_payments) elem;

  if v_paid < v_total then
    raise exception 'Payment (%) is less than the total (%)', v_paid, v_total;
  end if;

  select coalesce(max(s.order_no), 1000) + 1 into v_order_no
    from sales s where s.restaurant_id = p_restaurant_id;

  insert into sales (restaurant_id, order_no, order_type, cashier_employee_id, subtotal, tax, total, status)
  values (p_restaurant_id, v_order_no, p_order_type, p_cashier_employee_id, v_subtotal, v_tax, v_total, 'completed')
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

-- ---------------------------------------------------------------
-- 2. SUPPLIERS + RESTOCK
-- ---------------------------------------------------------------
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  category text,
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_suppliers_restaurant on suppliers(restaurant_id);

create table stock_purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2) not null,
  total_cost numeric(12,2) not null,
  purchased_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_stock_purchases_restaurant on stock_purchases(restaurant_id, purchased_at desc);

-- Atomic counterpart for Restock, same rationale as create_sale() above.
create or replace function log_restock(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_supplier_id uuid,
  p_quantity numeric,
  p_unit_cost numeric
) returns uuid
language plpgsql
as $$
declare
  v_total numeric := p_quantity * p_unit_cost;
  v_purchase_id uuid;
  v_item_name text;
begin
  insert into stock_purchases (restaurant_id, inventory_item_id, supplier_id, quantity, unit_cost, total_cost)
  values (p_restaurant_id, p_inventory_item_id, p_supplier_id, p_quantity, p_unit_cost, v_total)
  returning id into v_purchase_id;

  select name into v_item_name from inventory_items where id = p_inventory_item_id;

  update inventory_items
    set current_stock = current_stock + p_quantity,
        cost = p_unit_cost,
        updated_at = now()
    where id = p_inventory_item_id;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount)
  values (p_restaurant_id, current_date, 'Stock purchase — ' || coalesce(v_item_name, 'item'), 'Stock purchase', 'expense', v_total);

  return v_purchase_id;
end;
$$;

alter table suppliers enable row level security;
alter table stock_purchases enable row level security;
create policy suppliers_super_admin_read on suppliers for select using (is_super_admin());
create policy stock_purchases_super_admin_read on stock_purchases for select using (is_super_admin());
