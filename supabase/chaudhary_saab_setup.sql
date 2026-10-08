-- Chaudhary Saab Fast Food & BBQ: Urdu menu, category colours, roles and permissions
-- Generated 2026-10-08 for Supabase project ykkvqmtswfmfagrxemzh (restropro)
-- Safe to re-run. It also applies migration 0021, so run this one file and you are done.
-- name = English name, name_ur = Urdu name (the POS shows Urdu while Settings -> "Show item names in Urdu" is on).
-- Three cold drinks (1 L, 1.5 L, 2 L) have no price on the printed menu: they load at price 0 and hidden.
-- Set their prices, then switch them on from the Products page.
-- All 19 deals sit under one "Deals" category, like deals made on the Products page. They have no component
-- products yet; open a deal under Products -> Deals to add them if you want stock to deduct per component.

do $$
declare
  rid uuid := '29dc12c9-6561-40a1-9195-d89df91adc72';   -- Chaudhary Saab Fast Food & BBQ
  tpl uuid := '02dc5b9b-f847-4f98-bff1-24f989827a6f';   -- Hunger Bites, copied only for default roles / permissions
begin
  -- 0. migration 0021 (Urdu names, category colours, Urdu switch). Same as supabase/migrations/0021, safe to repeat.
  alter table public.products add column if not exists name_ur text;
  alter table public.menu_categories add column if not exists color text;
  if not exists (select 1 from pg_constraint where conname = 'menu_categories_color_hex') then
    alter table public.menu_categories add constraint menu_categories_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  alter table public.restaurant_settings add column if not exists urdu_enabled boolean not null default false;

  -- 1. Urdu on for this restaurant (staff can switch it off in Settings -> POS controls)
  insert into public.restaurant_settings (restaurant_id, urdu_enabled) values (rid, true)
  on conflict (restaurant_id) do update set urdu_enabled = true;

  -- 2. default roles, permissions and expense categories (Chaudhary has none yet)
  insert into public.roles (restaurant_id, name, is_system)
  select rid, r.name, r.is_system from public.roles r
  where r.restaurant_id = tpl
    and not exists (select 1 from public.roles x where x.restaurant_id = rid and x.name = r.name);

  insert into public.role_permissions (restaurant_id, role, module, can_view)
  select rid, rp.role, rp.module, rp.can_view from public.role_permissions rp
  where rp.restaurant_id = tpl
  on conflict (restaurant_id, role, module) do nothing;

  insert into public.expense_categories (restaurant_id, name)
  select rid, e.name from public.expense_categories e
  where e.restaurant_id = tpl
    and not exists (select 1 from public.expense_categories x where x.restaurant_id = rid and x.name = e.name);

  -- 3. menu categories with colours (an existing category keeps its colour if it already has one)
  insert into public.menu_categories (restaurant_id, name, sort_order, color)
  select rid, v.name, v.ord, v.color
  from (values
    ('Shawarma', 0, '#F59E0B'),
    ('Bar.B.Q', 1, '#DC2626'),
    ('Karahi & Handi', 2, '#C2410C'),
    ('Fries', 3, '#EAB308'),
    ('Paratha Roll', 4, '#65A30D'),
    ('Broast', 5, '#B45309'),
    ('Burgers', 6, '#16A34A'),
    ('Pizza', 7, '#E11D48'),
    ('Wings', 8, '#EA580C'),
    ('Pasta', 9, '#7C3AED'),
    ('Deals', 10, '#0891B2'),
    ('Fry', 11, '#0D9488'),
    ('Others', 12, '#64748B'),
    ('Cold Drinks', 13, '#2563EB')
  ) as v(name, ord, color)
  where not exists (select 1 from public.menu_categories c where c.restaurant_id = rid and c.name = v.name);

  update public.menu_categories c set color = v.color, sort_order = v.ord
  from (values
    ('Shawarma', 0, '#F59E0B'),
    ('Bar.B.Q', 1, '#DC2626'),
    ('Karahi & Handi', 2, '#C2410C'),
    ('Fries', 3, '#EAB308'),
    ('Paratha Roll', 4, '#65A30D'),
    ('Broast', 5, '#B45309'),
    ('Burgers', 6, '#16A34A'),
    ('Pizza', 7, '#E11D48'),
    ('Wings', 8, '#EA580C'),
    ('Pasta', 9, '#7C3AED'),
    ('Deals', 10, '#0891B2'),
    ('Fry', 11, '#0D9488'),
    ('Others', 12, '#64748B'),
    ('Cold Drinks', 13, '#2563EB')
  ) as v(name, ord, color)
  where c.restaurant_id = rid and c.name = v.name and c.color is null;

  -- 4. menu items: name = English, name_ur = Urdu
  create temp table _menu on commit drop as
  select * from (values
    ('Shawarma', 'Chicken Shawarma (Small)', 'چکن شوارما (چھوٹا)', 100, true, false, ''),
    ('Shawarma', 'Chicken Shawarma (Large)', 'چکن شوارما (بڑا)', 150, true, false, ''),
    ('Shawarma', 'Special Cheese Shawarma', 'اسپیشل چیز شوارما', 190, true, false, ''),
    ('Shawarma', 'Arabic Shawarma', 'عربک شوارما', 200, true, false, ''),
    ('Shawarma', 'Zinger Shawarma', 'زنگر شوارما', 200, true, false, ''),
    ('Shawarma', 'Zinger Cheese Shawarma', 'زنگر چیز شوارما', 250, true, false, ''),
    ('Shawarma', 'Chicken Grill Shawarma', 'چکن گرل شوارما', 260, true, false, ''),
    ('Shawarma', 'Chicken Grill Cheese Shawarma', 'چکن گرل چیز شوارما', 300, true, false, ''),
    ('Shawarma', 'Shawarma Platter', 'شوارما پلیٹر', 420, true, false, ''),
    ('Bar.B.Q', 'Chicken Tikka Boti', 'چکن تکہ بوٹی', 150, true, false, ''),
    ('Bar.B.Q', 'Chicken Malai Tikka Boti', 'چکن ملائی تکہ بوٹی', 200, true, false, ''),
    ('Bar.B.Q', 'Chicken Chest Piece', 'چکن چیسٹ پیس', 390, true, false, ''),
    ('Bar.B.Q', 'Chicken Leg Piece', 'چکن لیگ پیس', 340, true, false, ''),
    ('Bar.B.Q', 'Chicken Malai Chest Piece', 'چکن ملائی چیسٹ پیس', 420, true, false, ''),
    ('Bar.B.Q', 'Chicken Malai Leg Piece', 'چکن ملائی لیگ پیس', 370, true, false, ''),
    ('Bar.B.Q', 'Chicken Qalmi Tikka (3 piece)', 'چکن قلمی تکہ (3 پیس)', 360, true, false, ''),
    ('Bar.B.Q', 'Chicken Sheshtaoq Boti', 'چکن شیشطاؤق بوٹی', 180, true, false, ''),
    ('Bar.B.Q', 'Chicken Seekh Kabab', 'چکن سیخ کباب', 150, true, false, ''),
    ('Bar.B.Q', 'Chicken Reshmi Kabab', 'چکن ریشمی کباب', 170, true, false, ''),
    ('Bar.B.Q', 'Chicken Gola Kabab (3 piece)', 'چکن گولہ کباب (3 پیس)', 200, true, false, ''),
    ('Bar.B.Q', 'Chicken Pizza Kabab', 'چکن پیزا کباب', 200, true, false, ''),
    ('Bar.B.Q', 'Chicken Cheese Kabab', 'چکن چیز کباب', 180, true, false, ''),
    ('Bar.B.Q', 'Chicken Makhmali Kabab', 'چکن مخملی کباب', 220, true, false, ''),
    ('Karahi & Handi', 'Chicken Karahi (Half)', 'چکن کڑاہی (ہاف)', 800, true, false, ''),
    ('Karahi & Handi', 'Chicken Karahi (Full)', 'چکن کڑاہی (فل)', 1500, true, false, ''),
    ('Karahi & Handi', 'Chicken White Karahi (Half)', 'چکن وائٹ کڑاہی (ہاف)', 900, true, false, ''),
    ('Karahi & Handi', 'Chicken White Karahi (Full)', 'چکن وائٹ کڑاہی (فل)', 1700, true, false, ''),
    ('Karahi & Handi', 'Chicken Makhni Karahi (Half)', 'چکن مکھنی کڑاہی (ہاف)', 1000, true, false, ''),
    ('Karahi & Handi', 'Chicken Makhni Karahi (Full)', 'چکن مکھنی کڑاہی (فل)', 1900, true, false, ''),
    ('Karahi & Handi', 'Chicken Handi (Half)', 'چکن ہانڈی (ہاف)', 900, true, false, ''),
    ('Karahi & Handi', 'Chicken Handi (Full)', 'چکن ہانڈی (فل)', 1700, true, false, ''),
    ('Karahi & Handi', 'Chicken White Handi (Half)', 'چکن وائٹ ہانڈی (ہاف)', 1000, true, false, ''),
    ('Karahi & Handi', 'Chicken White Handi (Full)', 'چکن وائٹ ہانڈی (فل)', 1900, true, false, ''),
    ('Karahi & Handi', 'Chicken Makhni Handi (Half)', 'چکن مکھنی ہانڈی (ہاف)', 1000, true, false, ''),
    ('Karahi & Handi', 'Chicken Makhni Handi (Full)', 'چکن مکھنی ہانڈی (فل)', 1900, true, false, ''),
    ('Karahi & Handi', 'Chicken Cheese Handi (Half)', 'چکن چیز ہانڈی (ہاف)', 1100, true, false, ''),
    ('Karahi & Handi', 'Chicken Cheese Handi (Full)', 'چکن چیز ہانڈی (فل)', 2100, true, false, ''),
    ('Fries', 'French Fries (Small)', 'فرنچ فرائز (چھوٹا)', 100, true, false, ''),
    ('Fries', 'French Fries (Medium)', 'فرنچ فرائز (درمیانہ)', 150, true, false, ''),
    ('Fries', 'French Fries (Large)', 'فرنچ فرائز (بڑا)', 200, true, false, ''),
    ('Fries', 'Flavored Masala Fries (Small)', 'فلیورڈ مسالہ فرائز (چھوٹا)', 100, true, false, ''),
    ('Fries', 'Flavored Masala Fries (Medium)', 'فلیورڈ مسالہ فرائز (درمیانہ)', 150, true, false, ''),
    ('Fries', 'Flavored Masala Fries (Large)', 'فلیورڈ مسالہ فرائز (بڑا)', 200, true, false, ''),
    ('Fries', 'Loaded Fries', 'لوڈڈ فرائز', 240, true, false, ''),
    ('Fries', 'Cheese Fries', 'چیز فرائز', 300, true, false, ''),
    ('Fries', 'Pizza Fries', 'پیزا فرائز', 340, true, false, ''),
    ('Fries', 'Zinger Fries', 'زنگر فرائز', 400, true, false, ''),
    ('Paratha Roll', 'Chicken Tikka Boti Roll', 'چکن تکہ بوٹی رول', 240, true, false, ''),
    ('Paratha Roll', 'Chicken Tikka Boti Cheese Roll', 'چکن تکہ بوٹی چیز رول', 280, true, false, ''),
    ('Paratha Roll', 'Chicken Tikka Boti Mayo Roll', 'چکن تکہ بوٹی مایو رول', 260, true, false, ''),
    ('Paratha Roll', 'Chicken Tikka Mayo Cheese Roll', 'چکن تکہ مایو چیز رول', 300, true, false, ''),
    ('Paratha Roll', 'Chicken Mayo Garlic Roll', 'چکن مایو گارلک رول', 270, true, false, ''),
    ('Paratha Roll', 'Chicken Mayo Garlic Cheese Roll', 'چکن مایو گارلک چیز رول', 300, true, false, ''),
    ('Paratha Roll', 'Zinger Roll', 'زنگر رول', 260, true, false, ''),
    ('Paratha Roll', 'Zinger Cheese Roll', 'زنگر چیز رول', 300, true, false, ''),
    ('Paratha Roll', 'Zinger Mayo Garlic Roll', 'زنگر مایو گارلک رول', 280, true, false, ''),
    ('Paratha Roll', 'Zinger Mayo Garlic Cheese Roll', 'زنگر مایو گارلک چیز رول', 320, true, false, ''),
    ('Paratha Roll', 'Chicken Malai Boti Roll', 'چکن ملائی بوٹی رول', 320, true, false, ''),
    ('Paratha Roll', 'Chicken Malai Boti Cheese Roll', 'چکن ملائی بوٹی چیز رول', 360, true, false, ''),
    ('Paratha Roll', 'Chicken Kabab Roll', 'چکن کباب رول', 220, true, false, ''),
    ('Paratha Roll', 'Chicken Kabab Cheese Roll', 'چکن کباب چیز رول', 260, true, false, ''),
    ('Paratha Roll', 'Shapata Roll', 'شپاٹا رول', 370, true, false, ''),
    ('Broast', 'Chicken Broast Chest', 'چکن بروسٹ چیسٹ', 370, true, false, ''),
    ('Broast', 'Chicken Broast Leg', 'چکن بروسٹ لیگ', 320, true, false, ''),
    ('Broast', 'Crispy Drum Stick', 'کرسپی ڈرم اسٹک', 130, true, false, ''),
    ('Broast', 'Crispy Wings', 'کرسپی ونگز', 80, true, false, ''),
    ('Broast', 'Crispy Neck', 'کرسپی نیک', 60, true, false, ''),
    ('Broast', 'Crispy Thai Piece', 'کرسپی تھائی پیس', 220, true, false, ''),
    ('Burgers', 'Zinger Burger', 'زنگر برگر', 280, true, false, ''),
    ('Burgers', 'Zinger Cheese Burger', 'زنگر چیز برگر', 320, true, false, ''),
    ('Burgers', 'Zinger Jalapeno Burger', 'زنگر جلاپینو برگر', 350, true, false, ''),
    ('Burgers', 'Zinger Mighty Burger', 'زنگر مائٹی برگر', 390, true, false, ''),
    ('Burgers', 'Chicken Grill Burger', 'چکن گرل برگر', 390, true, false, ''),
    ('Burgers', 'Chicken Grill Cheese Burger', 'چکن گرل چیز برگر', 440, true, false, ''),
    ('Burgers', 'Chicken Grill Loaded Burger', 'چکن گرل لوڈڈ برگر', 480, true, false, ''),
    ('Burgers', 'Chicken Grill Chunky Burger', 'چکن گرل چنکی برگر', 490, true, false, ''),
    ('Burgers', 'Anda Shami Burger', 'انڈا شامی برگر', 150, true, false, ''),
    ('Burgers', 'Double Anda Shami Burger', 'ڈبل انڈا شامی برگر', 200, true, false, ''),
    ('Burgers', 'Chicken Burger', 'چکن برگر', 230, true, false, ''),
    ('Burgers', 'Chappli Kabab Burger', 'چپلی کباب برگر', 230, true, false, ''),
    ('Burgers', 'Chicken Tikka Burger', 'چکن تکہ برگر', 250, true, false, ''),
    ('Burgers', 'Chicken Kabab Burger', 'چکن کباب برگر', 230, true, false, ''),
    ('Pizza', 'Chicken Fajita Pizza (Small)', 'چکن فاجیٹا پیزا (چھوٹا)', 350, true, false, ''),
    ('Pizza', 'Chicken Fajita Pizza (Medium)', 'چکن فاجیٹا پیزا (درمیانہ)', 550, true, false, ''),
    ('Pizza', 'Chicken Fajita Pizza (Large)', 'چکن فاجیٹا پیزا (بڑا)', 800, true, false, ''),
    ('Pizza', 'Chicken Tikka Pizza (Small)', 'چکن تکہ پیزا (چھوٹا)', 350, true, false, ''),
    ('Pizza', 'Chicken Tikka Pizza (Medium)', 'چکن تکہ پیزا (درمیانہ)', 550, true, false, ''),
    ('Pizza', 'Chicken Tikka Pizza (Large)', 'چکن تکہ پیزا (بڑا)', 800, true, false, ''),
    ('Pizza', 'Euro Delight Pizza (Small)', 'یورو ڈیلائٹ پیزا (چھوٹا)', 350, true, false, ''),
    ('Pizza', 'Euro Delight Pizza (Medium)', 'یورو ڈیلائٹ پیزا (درمیانہ)', 550, true, false, ''),
    ('Pizza', 'Euro Delight Pizza (Large)', 'یورو ڈیلائٹ پیزا (بڑا)', 800, true, false, ''),
    ('Pizza', 'Chicken Sicillian Pizza (Small)', 'چکن سسیلین پیزا (چھوٹا)', 350, true, false, ''),
    ('Pizza', 'Chicken Sicillian Pizza (Medium)', 'چکن سسیلین پیزا (درمیانہ)', 550, true, false, ''),
    ('Pizza', 'Chicken Sicillian Pizza (Large)', 'چکن سسیلین پیزا (بڑا)', 800, true, false, ''),
    ('Pizza', 'Veggie Lover''s Pizza (Small)', 'ویجی لورز پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Veggie Lover''s Pizza (Medium)', 'ویجی لورز پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Veggie Lover''s Pizza (Large)', 'ویجی لورز پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Chicken Fajita Sicillian Pizza (Small)', 'چکن فاجیٹا سسیلین پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Chicken Fajita Sicillian Pizza (Medium)', 'چکن فاجیٹا سسیلین پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Chicken Fajita Sicillian Pizza (Large)', 'چکن فاجیٹا سسیلین پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Bonefire Pizza (Small)', 'بون فائر پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Bonefire Pizza (Medium)', 'بون فائر پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Bonefire Pizza (Large)', 'بون فائر پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Paratha Pizza (Small)', 'پراٹھا پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Paratha Pizza (Medium)', 'پراٹھا پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Paratha Pizza (Large)', 'پراٹھا پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Malai Boti Pizza (Small)', 'ملائی بوٹی پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Malai Boti Pizza (Medium)', 'ملائی بوٹی پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Malai Boti Pizza (Large)', 'ملائی بوٹی پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Jalapeno Pizza (Small)', 'جلاپینو پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Jalapeno Pizza (Medium)', 'جلاپینو پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Jalapeno Pizza (Large)', 'جلاپینو پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Achari Pizza (Small)', 'اچاری پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Achari Pizza (Medium)', 'اچاری پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Achari Pizza (Large)', 'اچاری پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Shawarma Pizza (Small)', 'شوارما پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Shawarma Pizza (Medium)', 'شوارما پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Shawarma Pizza (Large)', 'شوارما پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Supreme Pizza (Small)', 'سپریم پیزا (چھوٹا)', 500, true, false, ''),
    ('Pizza', 'Supreme Pizza (Medium)', 'سپریم پیزا (درمیانہ)', 750, true, false, ''),
    ('Pizza', 'Supreme Pizza (Large)', 'سپریم پیزا (بڑا)', 1000, true, false, ''),
    ('Pizza', 'Chaudhary''s Special Pizza (Medium)', 'چوہدری اسپیشل پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Chaudhary''s Special Pizza (Large)', 'چوہدری اسپیشل پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Behari Kabab Pizza (Medium)', 'بہاری کباب پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Behari Kabab Pizza (Large)', 'بہاری کباب پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Seekh Kabab Pizza (Medium)', 'سیخ کباب پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Seekh Kabab Pizza (Large)', 'سیخ کباب پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Mughlai Pizza (Medium)', 'مغلئی پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Mughlai Pizza (Large)', 'مغلئی پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Perri Perri Pizza (Medium)', 'پیری پیری پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Perri Perri Pizza (Large)', 'پیری پیری پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Crunchy Pizza (Medium)', 'کرنچی پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Crunchy Pizza (Large)', 'کرنچی پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Special Multani Pizza (Medium)', 'اسپیشل ملتانی پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Special Multani Pizza (Large)', 'اسپیشل ملتانی پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Crown Crust Pizza (Medium)', 'کراؤن کرسٹ پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Crown Crust Pizza (Large)', 'کراؤن کرسٹ پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', 'Extreme Pizza (Medium)', 'ایکسٹریم پیزا (درمیانہ)', 900, true, false, ''),
    ('Pizza', 'Extreme Pizza (Large)', 'ایکسٹریم پیزا (بڑا)', 1300, true, false, ''),
    ('Pizza', '4 XL Pizza (Any Four Flavour) (Medium)', '4 ایکس ایل پیزا (کوئی بھی چار فلیور) (درمیانہ)', 1200, true, false, ''),
    ('Pizza', '4 XL Pizza (Any Four Flavour) (Large)', '4 ایکس ایل پیزا (کوئی بھی چار فلیور) (بڑا)', 1600, true, false, ''),
    ('Wings', '6pc Wings', '6 پیس ونگز', 300, true, false, ''),
    ('Wings', '12pc Wings', '12 پیس ونگز', 550, true, false, ''),
    ('Wings', '6pc Ovenbaked Wings', '6 پیس اوون بیکڈ ونگز', 300, true, false, ''),
    ('Wings', '12pc Ovenbaked Wings', '12 پیس اوون بیکڈ ونگز', 550, true, false, ''),
    ('Wings', '6pc Bar.B.Q Wings', '6 پیس بار بی کیو ونگز', 350, true, false, ''),
    ('Wings', '12pc Bar.B.Q Wings', '12 پیس بار بی کیو ونگز', 600, true, false, ''),
    ('Wings', '6pc Hot & Spicy Wings', '6 پیس ہاٹ اینڈ اسپائسی ونگز', 350, true, false, ''),
    ('Wings', '12pc Hot & Spicy Wings', '12 پیس ہاٹ اینڈ اسپائسی ونگز', 600, true, false, ''),
    ('Pasta', 'Flemming Pasta (Half)', 'فلیمنگ پاستا (ہاف)', 300, true, false, ''),
    ('Pasta', 'Flemming Pasta (Full)', 'فلیمنگ پاستا (فل)', 550, true, false, ''),
    ('Pasta', 'Chaudhary''s Special Pasta (Half)', 'چوہدری اسپیشل پاستا (ہاف)', 320, true, false, ''),
    ('Pasta', 'Chaudhary''s Special Pasta (Full)', 'چوہدری اسپیشل پاستا (فل)', 600, true, false, ''),
    ('Pasta', 'Crispy Pasta (Half)', 'کرسپی پاستا (ہاف)', 370, true, false, ''),
    ('Pasta', 'Crispy Pasta (Full)', 'کرسپی پاستا (فل)', 700, true, false, ''),
    ('Pasta', 'Creamy Pasta (Half)', 'کریمی پاستا (ہاف)', 370, true, false, ''),
    ('Pasta', 'Creamy Pasta (Full)', 'کریمی پاستا (فل)', 700, true, false, ''),
    ('Pasta', '20 20 Pasta (Half)', 'ٹوئنٹی ٹوئنٹی پاستا (ہاف)', 370, true, false, ''),
    ('Pasta', '20 20 Pasta (Full)', 'ٹوئنٹی ٹوئنٹی پاستا (فل)', 700, true, false, ''),
    ('Pasta', 'Pizza Pasta (Half)', 'پیزا پاستا (ہاف)', 400, true, false, ''),
    ('Pasta', 'Pizza Pasta (Full)', 'پیزا پاستا (فل)', 750, true, false, ''),
    ('Deals', 'Deal 1', 'ڈیل 1', 300, true, true, '1 Chicken Petty Burger, Regular Fries, 350ml Drink'),
    ('Deals', 'Deal 2', 'ڈیل 2', 380, true, true, '1 Zinger Burger, Regular Fries, 350ml Drink'),
    ('Deals', 'Deal 3', 'ڈیل 3', 350, true, true, '1 Half Flemming Pasta, 350ml Drink'),
    ('Deals', 'Deal 4', 'ڈیل 4', 450, true, true, '1 Twister Roll, 350ml Drink'),
    ('Deals', 'Deal 5', 'ڈیل 5', 550, true, true, '1 Small Classic Pizza + Dip Sauce, 350ml Drink'),
    ('Deals', 'Deal 6', 'ڈیل 6', 350, true, true, '2 Large Shawarma, 350ml Drink'),
    ('Deals', 'Deal 7', 'ڈیل 7', 500, true, true, '2 Chicken Petty Burger, Regular Fries, 350ml Drink'),
    ('Deals', 'Deal 8', 'ڈیل 8', 620, true, true, '2 Zinger Burger, Regular Fries, 350ml Drink'),
    ('Deals', 'Deal 9', 'ڈیل 9', 620, true, true, '1 Full Flemming Pasta, 350ml Drink'),
    ('Deals', 'Deal 10', 'ڈیل 10', 720, true, true, 'Shawarma Platter, Loaded Fries, 500ml Drink'),
    ('Deals', 'Deal 11', 'ڈیل 11', 1050, true, true, '1 Medium Pizza, 1 Loaded Fries, 1 Ltr Drink'),
    ('Deals', 'Deal 12', 'ڈیل 12', 1100, true, true, '1 Medium Pizza, 1 Flemming Pasta, 1 Ltr Drink'),
    ('Deals', 'Deal 13', 'ڈیل 13', 1100, true, true, '1 Large Pizza + Dip Sauce, 1 Ltr Drink'),
    ('Deals', 'Deal 14', 'ڈیل 14', 1300, true, true, '1 Medium Pizza, 1 Small Pizza + Dip Sauce, 1 Ltr Drink'),
    ('Deals', 'Deal 15', 'ڈیل 15', 1620, true, true, '3 Zinger Burger, 1 Medium Pizza + Dip Sauce, 1.5 Ltr Drink'),
    ('Deals', 'Deal 16', 'ڈیل 16', 1800, true, true, '1 Large Pizza, 1 Medium Pizza + Dip Sauce, 1.5 Ltr Drink'),
    ('Deals', 'Deal 17', 'ڈیل 17', 2100, true, true, '2 Large Pizza + Dip Sauce, 1.5 Ltr Drink'),
    ('Deals', 'Deal 18', 'ڈیل 18', 2400, true, true, '1 Large Pizza, 1 Medium Pizza + Dip Sauce, 6pc Wings, Half Pasta, 2 Ltr Drink'),
    ('Deals', 'Deal 19', 'ڈیل 19', 2800, true, true, '2 Large Pizza + Dip Sauce, 1 Full Fleming Pasta, 6pc Wings, 2 Ltr Drink'),
    ('Fry', 'Chicken Tikka Fry', 'چکن تکہ فرائی', 230, true, false, ''),
    ('Fry', 'Chicken Malai Boti Fry', 'چکن ملائی بوٹی فرائی', 300, true, false, ''),
    ('Fry', 'Chicken Chest Tawa Piece', 'چکن چیسٹ توا پیس', 500, true, false, ''),
    ('Fry', 'Chicken Leg Tawa Piece', 'چکن لیگ توا پیس', 450, true, false, ''),
    ('Fry', 'Chicken Broast Chest Fry', 'چکن بروسٹ چیسٹ فرائی', 550, true, false, ''),
    ('Fry', 'Chicken Broast Leg Fry', 'چکن بروسٹ لیگ فرائی', 500, true, false, ''),
    ('Fry', 'Kaleji Fry', 'کلیجی فرائی', 170, true, false, ''),
    ('Fry', 'Seekh Kabab Fry', 'سیخ کباب فرائی', 220, true, false, ''),
    ('Fry', 'Anda Shammi Fry', 'انڈا شامی فرائی', 130, true, false, ''),
    ('Fry', 'Daal Mash Fry', 'دال ماش فرائی', 200, true, false, ''),
    ('Fry', 'Simple Shami', 'سادہ شامی', 50, true, false, ''),
    ('Fry', 'Masala Roti', 'مسالہ روٹی', 50, true, false, ''),
    ('Fry', 'Masala Naan', 'مسالہ نان', 50, true, false, ''),
    ('Others', 'Roti', 'روٹی', 15, true, false, ''),
    ('Others', 'Khameeri Roti', 'خمیری روٹی', 20, true, false, ''),
    ('Others', 'Naan', 'نان', 20, true, false, ''),
    ('Others', 'Roghni Naan', 'روغنی نان', 30, true, false, ''),
    ('Others', 'Puri Paratha', 'پوری پراٹھا', 80, true, false, ''),
    ('Others', 'Mint Raita', 'پودینہ رائتہ', 30, true, false, ''),
    ('Others', 'Salad', 'سلاد', 30, true, false, ''),
    ('Cold Drinks', 'Regular Drink', 'ریگولر ڈرنک', 70, true, false, ''),
    ('Cold Drinks', 'Regular Sting', 'ریگولر اسٹنگ', 80, true, false, ''),
    ('Cold Drinks', '350ml Drink', '350 ملی لیٹر ڈرنک', 80, true, false, ''),
    ('Cold Drinks', '500ml Drink', '500 ملی لیٹر ڈرنک', 120, true, false, ''),
    ('Cold Drinks', '1 Liter Drink', '1 لیٹر ڈرنک', 0, false, false, ''),
    ('Cold Drinks', '1.5 Liter Drink', '1.5 لیٹر ڈرنک', 0, false, false, ''),
    ('Cold Drinks', '2 Liter Drink', '2 لیٹر ڈرنک', 0, false, false, '')
  ) as t(cat, name, name_ur, price, is_available, is_deal, description);

  -- the test item typed earlier has Urdu in "name": move it to name_ur and give it the English name
  update public.products p set name = m.name, name_ur = m.name_ur
  from _menu m
  where p.restaurant_id = rid and p.name = m.name_ur and p.deleted_at is null
    and not exists (select 1 from public.products x where x.restaurant_id = rid and x.name = m.name and x.deleted_at is null);

  insert into public.products (restaurant_id, category_id, name, name_ur, price, is_available, is_deal, description)
  select rid, c.id, m.name, m.name_ur, m.price::numeric, m.is_available, m.is_deal, nullif(m.description, '')
  from _menu m
  join public.menu_categories c on c.restaurant_id = rid and c.name = m.cat
  where not exists (select 1 from public.products p where p.restaurant_id = rid and p.name = m.name and p.deleted_at is null);

  -- items that already existed just get their Urdu name filled in
  update public.products p set name_ur = m.name_ur
  from _menu m
  where p.restaurant_id = rid and p.name = m.name and p.deleted_at is null and p.name_ur is null;
end $$;

-- Check afterwards:
-- select c.name, c.color, count(p.*) from menu_categories c left join products p on p.category_id = c.id
--   where c.restaurant_id = '29dc12c9-6561-40a1-9195-d89df91adc72' group by c.name, c.color, c.sort_order order by c.sort_order;
