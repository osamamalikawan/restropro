-- =====================================================================
-- RESTRO PRO — Supabase migration 0010
-- Self-made inventory items (in-house prepared stock, e.g. dough, sauce):
-- their own recipe of raw ingredients, and a production log — the missing
-- piece needed for full Restock / Recipes & Production parity with the
-- HTML prototype (see scripts/restaurant/restock.js — "type === 'self_made'").
-- =====================================================================

alter table inventory_items
  add column item_type text not null default 'ready_made' check (item_type in ('ready_made', 'self_made')),
  add column category text;

-- Raw ingredients consumed per 1 unit produced of a self-made item. Same shape as
-- recipe_items (0002), but the "parent" is another inventory_items row instead of a product.
create table production_recipe_items (
  id uuid primary key default gen_random_uuid(),
  self_made_item_id uuid not null references inventory_items(id) on delete cascade,
  ingredient_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(12,4) not null,
  unique(self_made_item_id, ingredient_item_id)
);

create table production_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(12,3) not null,
  cost_per_unit numeric(12,2) not null,
  total_cost numeric(12,2) not null,
  employee_id uuid references employees(id),
  produced_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_production_logs_restaurant on production_logs(restaurant_id, produced_at desc);

alter table production_recipe_items enable row level security;
alter table production_logs enable row level security;
create policy production_recipe_items_super_admin_read on production_recipe_items for select using (is_super_admin());
create policy production_logs_super_admin_read on production_logs for select using (is_super_admin());

-- Atomic counterpart to log_restock() for the self-made side: consumes raw ingredients
-- (scaled by quantity produced), adds the produced quantity to the finished item's stock,
-- recomputes its unit cost from the recipe, and records the production log — one transaction.
create or replace function log_production(
  p_restaurant_id uuid,
  p_self_made_item_id uuid,
  p_quantity numeric,
  p_employee_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_total_cost numeric := 0;
  v_cost_per_unit numeric;
  v_log_id uuid;
  v_recipe record;
  v_available numeric;
begin
  if not exists (select 1 from production_recipe_items where self_made_item_id = p_self_made_item_id) then
    raise exception 'This item has no recipe yet — define it in Recipes & Production first';
  end if;

  -- Stock-sufficiency check across every ingredient before touching anything.
  for v_recipe in
    select ingredient_item_id, quantity from production_recipe_items where self_made_item_id = p_self_made_item_id
  loop
    select current_stock into v_available from inventory_items where id = v_recipe.ingredient_item_id;
    if v_available is null or v_available < v_recipe.quantity * p_quantity then
      raise exception 'Not enough raw stock to produce this quantity — check ingredient levels';
    end if;
  end loop;

  for v_recipe in
    select ingredient_item_id, quantity from production_recipe_items where self_made_item_id = p_self_made_item_id
  loop
    update inventory_items
      set current_stock = current_stock - v_recipe.quantity * p_quantity,
          updated_at = now()
      where id = v_recipe.ingredient_item_id;

    select v_total_cost + (v_recipe.quantity * p_quantity * cost) into v_total_cost
      from inventory_items where id = v_recipe.ingredient_item_id;
  end loop;

  v_cost_per_unit := round(v_total_cost / p_quantity, 2);

  update inventory_items
    set current_stock = current_stock + p_quantity,
        cost = v_cost_per_unit,
        updated_at = now()
    where id = p_self_made_item_id;

  insert into production_logs (restaurant_id, inventory_item_id, quantity, cost_per_unit, total_cost, employee_id)
  values (p_restaurant_id, p_self_made_item_id, p_quantity, v_cost_per_unit, v_total_cost, p_employee_id)
  returning id into v_log_id;

  return v_log_id;
end;
$$;
