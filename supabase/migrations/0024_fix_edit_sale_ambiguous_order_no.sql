-- =====================================================================
-- RESTRO PRO - Supabase migration 0024: fix 'column reference "order_no" is ambiguous' when editing an order
--
-- edit_sale() (migration 0019) returns TABLE(order_no, total). Inside a plpgsql function those output
-- columns act like variables, so the unqualified "select status, order_no ... from sales" was ambiguous and
-- every order edit failed with:  column reference "order_no" is ambiguous.
-- Same function, same arguments and result - only the sales columns are now qualified (s.order_no ...).
-- Safe to run twice.
-- =====================================================================

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
  -- columns are qualified with the table alias: the function RETURNS TABLE(order_no, total), and an
  -- unqualified order_no here is "ambiguous" between that output column and sales.order_no.
  select s.status, s.order_no, s.delivery_charge into v_status, v_order_no, v_existing_delivery
    from sales s where s.id = p_sale_id and s.restaurant_id = p_restaurant_id;
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

  update sales s
    set subtotal = v_subtotal, tax = v_tax, total = v_total, delivery_charge = v_delivery
    where s.id = p_sale_id;

  update accounts set amount = v_total where sale_id = p_sale_id and type = 'income';

  return query select v_order_no, v_total;
end;
$function$;

notify pgrst, 'reload schema';
