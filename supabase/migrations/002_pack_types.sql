-- ============================================================
-- Migration 002: Dynamic Pack Types + Flexible WIP Conversions
-- Run this in Supabase SQL Editor after 001_schema.sql
-- ============================================================

-- PACK TYPES table
create table if not exists pack_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Seed initial pack types
insert into pack_types (name, label, is_active, sort_order) values
  ('30g_individual', '30g Individual', true, 1),
  ('pack_of_6',      'Pack of 6',      true, 2),
  ('sample_200g',    '200g Sample',     true, 3)
on conflict (name) do nothing;

-- RLS for pack_types
alter table pack_types enable row level security;

create policy "All authenticated can read pack_types"
  on pack_types for select using (auth.uid() is not null);

create policy "Only admins can insert pack_types"
  on pack_types for insert with check (is_admin());

create policy "Only admins can update pack_types"
  on pack_types for update using (is_admin());

-- Remove hardcoded check constraint on stock_levels.pack_type
alter table stock_levels drop constraint if exists stock_levels_pack_type_check;

-- Restructure wip_conversions for flexible conversion
-- Drop the generated column first (depends on packs_30g_in), then the source column
alter table wip_conversions drop column if exists packs_of_6_out;
alter table wip_conversions drop column if exists packs_30g_in;

alter table wip_conversions
  add column if not exists from_pack_type text not null default '30g_individual',
  add column if not exists to_pack_type text not null default 'pack_of_6',
  add column if not exists input_qty int not null default 0,
  add column if not exists output_qty int not null default 0;
