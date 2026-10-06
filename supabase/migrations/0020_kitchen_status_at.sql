-- =====================================================================
-- RESTRO PRO - Supabase migration 0020
-- Ticket Rail hides a ticket one hour after it was moved to Completed. For that the database must
-- remember WHEN the kitchen status last changed, so sales.kitchen_status_at is stamped by a trigger
-- every time kitchen_status changes (from the web app, the Windows app's sync, or anywhere else).
-- Existing sales start with their creation time. Safe to run twice.
-- =====================================================================
alter table public.sales add column if not exists kitchen_status_at timestamptz;
update public.sales set kitchen_status_at = created_at where kitchen_status_at is null;
alter table public.sales alter column kitchen_status_at set default now();

create or replace function public.stamp_kitchen_status_at() returns trigger language plpgsql as $$
begin
  if new.kitchen_status is distinct from old.kitchen_status then
    new.kitchen_status_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_kitchen_status_at on public.sales;
create trigger trg_stamp_kitchen_status_at before update of kitchen_status on public.sales
  for each row execute function public.stamp_kitchen_status_at();

notify pgrst, 'reload schema';
