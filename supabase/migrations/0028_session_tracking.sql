-- =====================================================================
-- RESTRO PRO - Supabase migration 0028: one device per staff user + automatic sign-out of closed sessions
--
--   employees.active_sid     id of the web session that is currently signed in (new one on every PIN login, cleared on logout)
--   employees.active_device  random id of the browser that session belongs to (so the same browser can always sign back in)
--   employees.last_seen_at   last time that session did anything - the app pings every ~20 s while a tab is open
--
--   restaurant_settings.single_device_login  true = a user already signed in on one device cannot sign in on another
--                                            until the first one signs out or goes quiet
--   restaurant_settings.idle_logout_minutes  a session nobody has touched for this long (tab closed, device off, no
--                                            connection) is signed out automatically
-- The desktop (Tauri) app checks PINs on the device and is not covered by this. Safe to run twice.
-- =====================================================================
alter table public.employees add column if not exists active_sid text;
alter table public.employees add column if not exists active_device text;
alter table public.employees add column if not exists last_seen_at timestamptz;

alter table public.restaurant_settings add column if not exists single_device_login boolean not null default true;
alter table public.restaurant_settings add column if not exists idle_logout_minutes integer not null default 5;

notify pgrst, 'reload schema';
