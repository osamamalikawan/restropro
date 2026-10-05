-- =====================================================================
-- RESTRO PRO - Supabase migration 0019: ingredient stock may go negative
--
-- Before: create_sale() and edit_sale() deducted recipe ingredients with
--   greatest(0, current_stock - used)
-- so selling more than was in stock silently stopped at 0 and the shortfall was lost.
--
-- Now: stock is simply  current_stock - used , so an ingredient at 0 goes to -5 after a sale
-- that needs 5. When that ingredient is restocked, log_restock() already does
--   current_stock + quantity , so -5 + 20 = 15 (the missing amount is taken off the delivery).
-- cancel_sale() and edit_sale() add back exactly what a sale took, so the numbers stay balanced.
--
-- Also: create_sale() now takes a per-restaurant advisory lock first. Two devices uploading at
-- the same moment could previously both read the same "max(order_no) + 1" and get the same order
-- number; the lock makes them queue for the few milliseconds it takes.
--
-- Only the 13-argument create_sale() (the one the app calls) and edit_sale() are replaced.
-- log_restock, cancel_sale and log_production are unchanged. Safe to run twice.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_sale(p_restaurant_id uuid, p_cashier_employee_id uuid, p_order_type text, p_items jsonb, p_payments jsonb, p_tax_rate numeric DEFAULT 0.05, p_table_id uuid DEFAULT NULL::uuid, p_area_id uuid DEFAULT NULL::uuid, p_delivery_charge numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text)
 RETURNS TABLE(order_no integer, total numeric, status text, balance numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_status text;
  v_order_no int;
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_recipe record;
  v_customer_id uuid := p_customer_id;
begin
  -- one sale at a time per restaurant while the order number is picked
  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text, 0));

  select coalesce(sum((elem->>'price')::numeric * (elem->>'qty')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) elem;

  v_tax := round(v_subtotal * p_tax_rate);
  v_total := v_subtotal + v_tax + coalesce(p_delivery_charge, 0);

  select coalesce(sum((elem->>'amount')::numeric), 0) into v_paid
    from jsonb_array_elements(p_payments) elem;

  v_status := case when v_paid >= v_total then 'completed' else 'unpaid' end;

  if v_customer_id is null and p_customer_phone is not null and p_customer_phone <> '' then
    select id into v_customer_id from customers where restaurant_id = p_restaurant_id and phone = p_customer_phone;
    if v_customer_id is null then
      insert into customers (restaurant_id, name, phone, address, area_id)
      values (p_restaurant_id, coalesce(nullif(p_customer_name, ''), 'Walk-in Customer'), p_customer_phone, p_customer_address, p_area_id)
      returning id into v_customer_id;
    end if;
  end if;

  select coalesce(max(s.order_no), 1000) + 1 into v_order_no
    from sales s where s.restaurant_id = p_restaurant_id;

  insert into sales (restaurant_id, order_no, order_type, cashier_employee_id, subtotal, tax, total, status, table_id, area_id, delivery_charge, customer_id)
  values (p_restaurant_id, v_order_no, p_order_type, p_cashier_employee_id, v_subtotal, v_tax, v_total, v_status, p_table_id, p_area_id, coalesce(p_delivery_charge, 0), v_customer_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (sale_id, product_id, name, unit_price, quantity)
    values (v_sale_id, (v_item->>'productId')::uuid, v_item->>'name', (v_item->>'price')::numeric, (v_item->>'qty')::numeric);

    -- deduct every recipe ingredient; stock is allowed to go below zero
    for v_recipe in
      select inventory_item_id, quantity from recipe_items where product_id = (v_item->>'productId')::uuid
    loop
      update inventory_items
        set current_stock = current_stock - v_recipe.quantity * (v_item->>'qty')::numeric,
            updated_at = now()
        where id = v_recipe.inventory_item_id;
    end loop;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    if (v_payment->>'amount')::numeric > 0 then
      insert into sale_payments (sale_id, method, amount)
      values (v_sale_id, v_payment->>'method', (v_payment->>'amount')::numeric);
    end if;
  end loop;

  insert into accounts (restaurant_id, txn_date, description, category, type, amount, sale_id)
  values (p_restaurant_id, current_date, 'POS sale #' || v_order_no, 'Sales', 'income', v_total, v_sale_id);

  return query select v_order_no, v_total, v_status, greatest(v_total - v_paid, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edit_sale(p_sale_id uuid, p_restaurant_id uuid, p_items jsonb, p_tax_rate numeric DEFAULT 0.05, p_delivery_charge numeric DEFAULT NULL::numeric)
 RETURNS TABLE(order_no integer, total numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_status text;
  v_order_no int;
  v_existing_delivery numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_delivery numeric;
  v_item record;
  v_new_item jsonb;
  v_recipe record;
begin
  select status, order_no, delivery_charge into v_status, v_order_no, v_existing_delivery
    from sales where id = p_sale_id and restaurant_id = p_restaurant_id;
  if v_order_no is null then
    raise exception 'Sale not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot edit a cancelled order';
  end if;

  v_delivery := coalesce(p_delivery_charge, v_existing_delivery, 0);

  -- restore stock consumed by the original line items
  for v_item in select product_id, quantity from sale_items where sale_id = p_sale_id
  loop
    for v_recipe in select inventory_item_id, quantity from recipe_items where product_id = v_item.product_id
    loop
      update inventory_items
        set current_stock = current_stock + v_recipe.quantity * v_item.quantity, updated_at = now()
        where id = v_recipe.inventory_item_id;
    end loop;
  end loop;

  delete from sale_items where sale_id = p_sale_id;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Order must have at least one item';
  end if;

  select coalesce(sum((elem->>'price')::numeric * (elem->>'qty')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) elem;
  v_tax := round(v_subtotal * p_tax_rate);
  v_total := v_subtotal + v_tax + v_delivery;

  for v_new_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (sale_id, product_id, name, unit_price, quantity)
    values (p_sale_id, (v_new_item->>'productId')::uuid, v_new_item->>'name', (v_new_item->>'price')::numeric, (v_new_item->>'qty')::numeric);

    -- deduct the new line items; stock is allowed to go below zero
    for v_recipe in
      select inventory_item_id, quantity from recipe_items where product_id = (v_new_item->>'productId')::uuid
    loop
      update inventory_items
        set current_stock = current_stock - v_recipe.quantity * (v_new_item->>'qty')::numeric,
            updated_at = now()
        where id = v_recipe.inventory_item_id;
    end loop;
  end loop;

  update sales
    set subtotal = v_subtotal, tax = v_tax, total = v_total, delivery_charge = v_delivery
    where id = p_sale_id;

  update accounts set amount = v_total where sale_id = p_sale_id and type = 'income';

  return query select v_order_no, v_total;
end;
$function$;

notify pgrst, 'reload schema';
