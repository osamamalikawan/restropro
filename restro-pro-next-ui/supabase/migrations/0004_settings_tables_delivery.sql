-- =====================================================================
-- RESTRO PRO — Supabase migration 0004
-- Settings (per-tenant config), Tables, Delivery Areas — and extending create_sale()
-- to actually use a real tax rate, a table (dine-in), or a delivery area + charge.
-- =====================================================================

create table restaurant_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  tax_rate numeric(5,2) not null default 5,
  service_charge_rate numeric(5,2) not null default 10,
  printer_name text,
  paper_width text not null default '80mm',
  receipt_header text,
  receipt_footer text,
  updated_at timestamptz not null default now()
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  number text not null,
  seats int not null default 4,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, number)
);
create index ix_tables_restaurant on tables(restaurant_id);

create table delivery_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  delivery_fee numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, name)
);
create index ix_delivery_areas_restaurant on delivery_areas(restaurant_id);

alter table sales add column table_id uuid references tables(id);
alter table sales add column area_id uuid references delivery_areas(id);
alter table sales add column delivery_charge numeric(12,2) not null default 0;

alter table restaurant_settings enable row level security;
alter table tables enable row level security;
alter table delivery_areas enable row level security;
create policy restaurant_settings_super_admin_read on restaurant_settings for select using (is_super_admin());
create policy tables_super_admin_read on tables for select using (is_super_admin());
create policy delivery_areas_super_admin_read on delivery_areas for select using (is_super_admin());

-- Replace create_sale() to accept a real tax rate, an optional table, and an optional
-- delivery area + charge (delivery_charge is now part of the total).
create or replace function create_sale(
  p_restaurant_id uuid,
  p_cashier_employee_id uuid,
  p_order_type text,
  p_items jsonb,
  p_payments jsonb,
  p_tax_rate numeric default 0.05,
  p_table_id uuid default null,
  p_area_id uuid default null,
  p_delivery_charge numeric default 0
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
  v_total := v_subtotal + v_tax + coalesce(p_delivery_charge, 0);

  select coalesce(sum((elem->>'amount')::numeric), 0) into v_paid
    from jsonb_array_elements(p_payments) elem;

  if v_paid < v_total then
    raise exception 'Payment (%) is less than the total (%)', v_paid, v_total;
  end if;

  select coalesce(max(s.order_no), 1000) + 1 into v_order_no
    from sales s where s.restaurant_id = p_restaurant_id;

  insert into sales (restaurant_id, order_no, order_type, cashier_employee_id, subtotal, tax, total, status, table_id, area_id, delivery_charge)
  values (p_restaurant_id, v_order_no, p_order_type, p_cashier_employee_id, v_subtotal, v_tax, v_total, 'completed', p_table_id, p_area_id, coalesce(p_delivery_charge, 0))
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
