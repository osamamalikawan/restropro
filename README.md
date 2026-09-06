# Restro Pro — Next.js + Supabase

Real production architecture (not a prototype): Next.js 14 App Router, Supabase (Postgres +
Auth), local-first IndexedDB cache with background sync, PWA. See **ARCHITECTURE.md** for the
full design rationale — read that first, it explains *why* things are built this way, especially
the two different auth systems (Supabase Auth for owners/super admin, HMAC-signed cookies for
staff PIN login) and the sync engine.

## What's implemented in this pass

- ✅ Restaurant signup (owner email/password via Supabase Auth + admin name/PIN captured, tenant
  stays `pending`)
- ✅ Super Admin: email/password login, dashboard listing all restaurants with
  Activate/Suspend/Reactivate/Terminate
- ✅ **Activation flow does exactly what you asked**: only at Activate does the admin's
  `employees` row get created from the PIN captured at signup; before that, no one can log in
- ✅ One-time self-disabling bootstrap route to create your first Super Admin
- ✅ Subscriptions: monthly/yearly, 3-day grace period, enforced at login time (not just by the
  cron sweep) — `lib/subscription.ts` is the single source of truth for the status state machine
- ✅ Daily cron (`vercel.json`) that sweeps subscription status and fires a grace-period
  notification
- ✅ Notifications: Super Admin can send to all restaurants or a hand-picked subset
- ✅ Local-first storage: IndexedDB cache + optimistic writes + outbox + Supabase Realtime pull,
  demonstrated end-to-end on the Employees list in the restaurant dashboard
- ✅ PWA manifest + service worker (app-shell caching)
- ✅ Full SQL migration with RLS policies

## What's NOT in this pass (intentionally — see below for why)

- ❌ **The rest of the operational app** (POS, inventory, recipes, accounts, etc. from the earlier
  HTML prototype) is not ported yet. Porting each module means: add its table to the migration,
  add it to `SYNCABLE_STORES` in `lib/offline-db.ts`, and replicate the `employees-panel.tsx` /
  `lib/sync.ts` pattern for it. That's genuinely a large, mechanical effort — dozens of tables and
  pages — not something to fake with a thin stub. I built the *pattern* correctly and completely
  on one real module so the rest is a repeatable recipe, not a design problem.
- ❌ Payment processing (Stripe/Paddle) — plan changes and activation are Super-Admin-manual right
  now. See ARCHITECTURE.md §6.
- ❌ Real PWA icons — `public/manifest.json` references `/icons/icon-*.png` that don't exist yet;
  generate real ones (e.g. via https://realfavicongenerator.net) and drop them in `public/icons/`.
- ❌ Rate limiting on the PIN login route — a 4-digit PIN is brute-forceable without it. Don't go
  live without adding this (Upstash + `@upstash/ratelimit` is the easiest Vercel-native option).
- ❌ Transactional email (signup confirmation, activation notice, password reset UI)
- ❌ Automated tests

## Setup

### 1. Supabase project
1. Create a project at supabase.com.
2. Project Settings → API: copy the URL and publishable key into `.env.local` (copy
   `.env.example` first).
3. Project Settings → API → service_role key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
   commit this or prefix it with `NEXT_PUBLIC_`).
4. SQL Editor → paste and run `supabase/migrations/0001_init.sql`.

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in every value, including two random secrets you
generate yourself:
```bash
openssl rand -base64 48   # STAFF_SESSION_SECRET
openssl rand -base64 32   # CRON_SECRET and BOOTSTRAP_SECRET
```

### 3. Install & run
```bash
npm install
npm run dev
```

### 4. Create your first Super Admin (once)
```bash
curl -X POST http://localhost:3000/api/super-admin/bootstrap \
  -H "content-type: application/json" \
  -d '{"email":"admin@restropro.com","password":"a-real-password","bootstrapSecret":"YOUR_BOOTSTRAP_SECRET"}'
```
This route 403s forever once a super admin exists — safe to leave deployed.

### 5. Try the flow
1. Visit `/signup`, create a restaurant (note the restaurant name you pick).
2. Visit `/super-admin/login`, sign in as the super admin you just bootstrapped.
3. `/super-admin/dashboard` → Activate the new restaurant.
4. Supabase Table Editor → `restaurants` → copy the `slug` of the row you just activated.
5. Visit `/login`, enter that slug + the 4-digit PIN you signed up with → lands on `/dashboard`.

## Deploying to Vercel

1. Push this to a GitHub repo, import it in Vercel.
2. Add every `.env.local` variable to the Vercel project's Environment Variables.
3. Vercel Cron (the `vercel.json` in this repo) picks up automatically on deploy — no extra
   config needed, it just needs `CRON_SECRET` set in the environment.
4. Re-run the bootstrap curl command against your production URL once, then treat that endpoint
   as permanently retired.

## Migrating the rest of the prototype's modules

For each remaining module (POS, inventory, restock, recipes, accounts, expenses, ...):
1. Add the table to a new file in `supabase/migrations/` (following the `employees` table's shape:
   `id`, `restaurant_id`, `updated_at`, `deleted_at`, RLS policy restricting to service-role only
   if it's staff-authenticated data).
2. Add its name to `SYNCABLE_STORES` in `lib/offline-db.ts`.
3. Add a branch for it in `lib/sync.ts`'s functions (they're already generic over `store` name —
   mostly just widening the TypeScript union type).
4. Build the page/component the same shape as `employees-panel.tsx`.

This is intentionally repetitive rather than clever, so any future model or developer can extend
it without re-deriving the pattern.
