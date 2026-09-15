-- =====================================================================
-- RESTRO PRO — Supabase migration 0002 — core operational tables
-- Menu/Products, Inventory, Recipes, Sales, Accounts.
-- Same RLS posture as `employees` in 0001: staff PIN sessions aren't Supabase Auth users,
-- so every one of these tables has NO owner/staff-facing RLS policy — all real access goes
-- through Next.js API routes using the service-role client, which verify the signed staff
-- session cookie and do their own tenant check (see ARCHITECTURE.md).
-- =====================================================================

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, name)
);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  current_stock numeric(12,3) not null default 0,
  min_stock numeric(12,3) not null default 0,
  cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_inventory_items_restaurant on inventory_items(restaurant_id);

create table products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  price numeric(12,2) not null default 0,
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_products_restaurant on products(restaurant_id);

-- Recipe: ingredients consumed per 1 unit of product sold. Selling a product deducts
-- `quantity` from each linked inventory_items.current_stock (see app/api/sales/route.ts).
create table recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(12,4) not null,
  unique(product_id, inventory_item_id)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_no int not null,
  order_type text not null default 'takeaway' check (order_type in ('dine_in','takeaway','delivery')),
  cashier_employee_id uuid references employees(id),
  subtotal numeric(12,2) not null,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  created_at timestamptz not null default now(),
  unique(restaurant_id, order_no)
);
create index ix_sales_restaurant on sales(restaurant_id, created_at desc);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,   -- snapshot at time of sale, survives product renames/deletes
  unit_price numeric(12,2) not null,
  quantity numeric(10,2) not null
);

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  txn_date date not null default current_date,
  description text not null,
  category text not null default 'Sales',
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index ix_accounts_restaurant on accounts(restaurant_id, txn_date desc);

-- ---------------------------------------------------------------
-- RLS: enabled, super-admin-oversight-only policies (same posture as employees in 0001).
-- All real reads/writes happen server-side via the service-role client.
-- ---------------------------------------------------------------
alter table menu_categories enable row level security;
alter table inventory_items enable row level security;
alter table products enable row level security;
alter table recipe_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sale_payments enable row level security;
alter table accounts enable row level security;

create policy menu_categories_super_admin_read on menu_categories for select using (is_super_admin());
create policy inventory_items_super_admin_read on inventory_items for select using (is_super_admin());
create policy products_super_admin_read on products for select using (is_super_admin());
create policy recipe_items_super_admin_read on recipe_items for select using (is_super_admin());
create policy sales_super_admin_read on sales for select using (is_super_admin());
create policy sale_items_super_admin_read on sale_items for select using (is_super_admin());
create policy sale_payments_super_admin_read on sale_payments for select using (is_super_admin());
create policy accounts_super_admin_read on accounts for select using (is_super_admin());
