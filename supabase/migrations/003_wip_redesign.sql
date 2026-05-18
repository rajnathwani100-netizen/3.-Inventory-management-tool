-- ============================================================
-- Migration 003: WIP Conversions — Multi-SKU BOM Redesign
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop old wip_conversions table (it had a bad schema)
drop table if exists wip_conversions cascade;

-- 2. Create new wip_conversions header table
create table if not exists wip_conversions (
  id          uuid primary key default gen_random_uuid(),
  notes       text,
  date        date not null default current_date,
  status      text not null default 'in_progress'
                check (status in ('in_progress', 'completed', 'rejected')),
  created_by  uuid references profiles(id),
  approved_by uuid references profiles(id),
  completed_at timestamptz,
  created_at  timestamptz default now()
);

-- 3. Input lines: individual SKUs consumed (deducted from stock)
create table if not exists wip_conversion_inputs (
  id            uuid primary key default gen_random_uuid(),
  conversion_id uuid references wip_conversions(id) on delete cascade,
  sku_id        uuid references skus(id),
  pack_type     text not null,
  quantity      int  not null check (quantity > 0)
);

-- 4. Output lines: finished SKUs produced (added to stock)
create table if not exists wip_conversion_outputs (
  id            uuid primary key default gen_random_uuid(),
  conversion_id uuid references wip_conversions(id) on delete cascade,
  sku_id        uuid references skus(id),
  pack_type     text not null,
  quantity      int  not null check (quantity > 0)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table wip_conversions enable row level security;
alter table wip_conversion_inputs enable row level security;
alter table wip_conversion_outputs enable row level security;

-- wip_conversions policies
create policy "All authenticated can read conversions"
  on wip_conversions for select using (auth.uid() is not null);

create policy "All authenticated can insert conversions"
  on wip_conversions for insert with check (auth.uid() is not null);

create policy "Admins/creators can update conversions"
  on wip_conversions for update
  using (is_admin() or auth.uid() = created_by);

-- wip_conversion_inputs policies
create policy "All authenticated can read conversion inputs"
  on wip_conversion_inputs for select using (auth.uid() is not null);

create policy "All authenticated can insert conversion inputs"
  on wip_conversion_inputs for insert with check (auth.uid() is not null);

-- wip_conversion_outputs policies
create policy "All authenticated can read conversion outputs"
  on wip_conversion_outputs for select using (auth.uid() is not null);

create policy "All authenticated can insert conversion outputs"
  on wip_conversion_outputs for insert with check (auth.uid() is not null);

-- Enable realtime
alter publication supabase_realtime add table wip_conversions;
