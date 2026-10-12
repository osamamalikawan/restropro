-- =====================================================================
-- RESTRO PRO - Supabase migration 0027: cancelling a COMPLETED order must not put its ingredients back
--
-- cancel_sale() (migration 0010) restores the recipe ingredients a sale consumed. That is right for an order
-- cancelled while it is Active or Preparing (the food was never made / can be reused), but a Completed order has
-- already been cooked and served, so its stock is gone for good.
--
-- cancel_sale_keep_stock() cancels exactly like cancel_sale() (status, accounts income, everything else it does) and
-- then takes the ingredients off again, all in one transaction, so the net effect on stock is zero.
-- The app calls it only for orders cancelled at the Completed stage. Safe to run twice.
-- =====================================================================
create or replace function public.cancel_sale_keep_stock(p_sale_id uuid, p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item   record;
  v_recipe record;
begin
  perform public.cancel_sale(p_sale_id, p_restaurant_id);

  for v_item in select product_id, quantity from sale_items where sale_id = p_sale_id
  loop
    for v_recipe in select inventory_item_id, quantity from recipe_items where product_id = v_item.product_id
    loop
      update inventory_items
        set current_stock = current_stock - v_recipe.quantity * v_item.quantity, updated_at = now()
        where id = v_recipe.inventory_item_id and restaurant_id = p_restaurant_id;
    end loop;
  end loop;
end;
$function$;

notify pgrst, 'reload schema';
