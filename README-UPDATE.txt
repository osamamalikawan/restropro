RESTRO PRO - Urdu names + category colours update
=================================================
Unzip this over your existing restropro folder (say yes to replace files).

1) Run supabase/chaudhary_saab_setup.sql in the Supabase SQL editor (it also applies migration 0021).
   Other restaurants later: run supabase/migrations/0021_urdu_and_category_colors.sql only.
2) Commit, push, redeploy.

NEW files:      lib/urdu.ts, lib/products-query.ts, supabase/migrations/0021_urdu_and_category_colors.sql,
                supabase/chaudhary_saab_setup.sql (one-off data script, not a migration)
CHANGED files:  everything else in this zip.
