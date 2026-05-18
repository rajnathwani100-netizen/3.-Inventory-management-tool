-- ============================================================
-- Migration 004: Hardwired Conversion Recipes (BOM system)
-- Run this in Supabase SQL Editor after 003_wip_redesign.sql
-- ============================================================

-- 0. Add recipe-tracking columns to wip_conversions
--    (recipe_id and selected_sku_id are set after recipes table is created below;
--     we add them as nullable first, then add the FK constraint at the end)
alter table wip_conversions
  add column if not exists recipe_id uuid,
  add column if not exists selected_sku_id uuid references skus(id),
  add column if not exists quantity int not null default 1;

-- 1. Add trio_pack to pack_types if not already there
insert into pack_types (name, label, is_active, sort_order) values
  ('trio_pack', 'Trio Pack', true, 3)
on conflict (name) do nothing;

-- Bump sample_200g to sort_order 4
update pack_types set sort_order = 4 where name = 'sample_200g';

-- 2. Conversion recipes table (one row = one "recipe card")
create table if not exists conversion_recipes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,               -- e.g. "Assorted Pack of 6", "2 Min Noodle Pack of 6", "Trio Pack"
  output_sku_id   uuid references skus(id),    -- null = uses the user-selected SKU at run time (for single-flavour packs)
  output_pack_type text not null,          -- e.g. 'pack_of_6', 'trio_pack'
  is_assorted bool not null default false, -- true = uses ALL active 30g SKUs as inputs (1 each)
  is_active   bool not null default true,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- 3. Ingredients per recipe (per 1 unit of output)
--    input_sku_id NULL means "use the same SKU as selected at run time" (for single-flavour packs)
create table if not exists conversion_recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid references conversion_recipes(id) on delete cascade,
  input_sku_id  uuid references skus(id),   -- null = same SKU as the run-time selection
  input_pack_type text not null,             -- always '30g_individual' for now
  qty_per_output_unit int not null check (qty_per_output_unit > 0)
);

-- ============================================================
-- Seed the 3 known recipes
-- NOTE: output_sku_id values must be filled in by the admin
--       via the Supabase dashboard or a follow-up seed once
--       the "Assorted Pack" and "Trio Pack" SKUs have been created.
--       The flavour-specific Pack of 6 uses output_sku_id = null
--       (resolved at run time from the user's SKU selection).
-- ============================================================

-- Recipe A: Assorted Pack of 6
-- output_sku_id: set this to the UUID of your "Assorted Pack of 6" SKU
-- is_assorted = true means "pull 1 of every active 30g_individual SKU"
insert into conversion_recipes (name, output_sku_id, output_pack_type, is_assorted, sort_order)
values ('Assorted Pack of 6', null, 'pack_of_6', true, 1);

-- Recipe B: Single-Flavour Pack of 6
-- output_sku_id null = user picks which flavour at run time
-- 1 ingredient: the same SKU, qty 6
do $$
declare
  recipe_id uuid;
begin
  insert into conversion_recipes (name, output_sku_id, output_pack_type, is_assorted, sort_order)
  values ('Single-Flavour Pack of 6', null, 'pack_of_6', false, 2)
  returning id into recipe_id;

  -- 1 ingredient line with null sku = "same as selected flavour"
  insert into conversion_recipe_ingredients (recipe_id, input_sku_id, input_pack_type, qty_per_output_unit)
  values (recipe_id, null, '30g_individual', 6);
end $$;

-- Recipe C: Trio Pack (static — 3 fixed flavours)
-- ingredients to be added AFTER you have the Chilli Lemony, Dream and Onion,
-- and Cheesy Peesy SKU UUIDs. Use the Supabase dashboard to insert:
--   INSERT INTO conversion_recipe_ingredients (recipe_id, input_sku_id, input_pack_type, qty_per_output_unit)
--   VALUES
--     ('<trio_recipe_id>', '<chilli_lemony_sku_id>', '30g_individual', 1),
--     ('<trio_recipe_id>', '<dream_and_onion_sku_id>', '30g_individual', 1),
--     ('<trio_recipe_id>', '<cheesy_peesy_sku_id>', '30g_individual', 1);
do $$
declare
  recipe_id uuid;
begin
  insert into conversion_recipes (name, output_sku_id, output_pack_type, is_assorted, sort_order)
  values ('Trio Pack', null, 'trio_pack', false, 3)
  returning id into recipe_id;
  -- ingredients for Trio Pack: insert manually in Supabase once you have the SKU IDs
  -- See comment above
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table conversion_recipes enable row level security;
alter table conversion_recipe_ingredients enable row level security;

create policy "All authenticated can read recipes"
  on conversion_recipes for select using (auth.uid() is not null);

create policy "Only admins can manage recipes"
  on conversion_recipes for all using (is_admin());

create policy "All authenticated can read recipe ingredients"
  on conversion_recipe_ingredients for select using (auth.uid() is not null);

create policy "Only admins can manage recipe ingredients"
  on conversion_recipe_ingredients for all using (is_admin());
