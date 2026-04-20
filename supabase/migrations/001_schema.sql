-- ============================================================
-- Knacks Inventory — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- PROFILES (extends Supabase Auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  name text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'staff', new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- SKUS
create table if not exists skus (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category text not null,
  low_stock_threshold int not null default 100,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- STOCK LEVELS
create table if not exists stock_levels (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references skus(id) on delete cascade,
  pack_type text not null check (pack_type in ('30g_individual','pack_of_6','sample_200g')),
  quantity int not null default 0,
  updated_at timestamptz default now(),
  unique(sku_id, pack_type)
);

-- INWARD ENTRIES
create table if not exists inward_entries (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references skus(id),
  pack_type text not null,
  quantity int not null,
  reason text not null,
  notes text,
  date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- OUTWARD ENTRIES
create table if not exists outward_entries (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references skus(id),
  pack_type text not null,
  quantity int not null,
  reason text not null,
  notes text,
  date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- ENTRY BATCHES (multiple SKUs per submission)
create table if not exists entry_batches (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inward','outward')),
  pack_type text not null,
  reason text not null,
  notes text,
  date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references entry_batches(id) on delete cascade,
  sku_id uuid references skus(id),
  quantity int not null
);

-- STALL SESSIONS
create table if not exists stall_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  date date not null,
  status text not null default 'active' check (status in ('active','closed')),
  created_by uuid references profiles(id),
  closed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists stall_items (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid references stall_sessions(id) on delete cascade,
  sku_id uuid references skus(id),
  pack_type text not null,
  dispatched int not null,
  returned int,
  sold int generated always as (dispatched - coalesce(returned, 0)) stored
);

-- WIP CONVERSIONS
create table if not exists wip_conversions (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references skus(id),
  packs_30g_in int not null,
  packs_of_6_out int generated always as (packs_30g_in / 6) stored,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  created_by uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table skus enable row level security;
alter table stock_levels enable row level security;
alter table inward_entries enable row level security;
alter table outward_entries enable row level security;
alter table entry_batches enable row level security;
alter table batch_items enable row level security;
alter table stall_sessions enable row level security;
alter table stall_items enable row level security;
alter table wip_conversions enable row level security;

-- Helper function to check admin role
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- PROFILES policies
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
create policy "Admins can read all profiles" on profiles for select using (is_admin());
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- SKUS policies
create policy "All authenticated can read skus" on skus for select using (auth.uid() is not null);
create policy "Only admins can insert skus" on skus for insert with check (is_admin());
create policy "Only admins can update skus" on skus for update using (is_admin());
create policy "Only admins can delete skus" on skus for delete using (is_admin());

-- STOCK_LEVELS policies
create policy "All authenticated can read stock" on stock_levels for select using (auth.uid() is not null);
create policy "Service role can update stock" on stock_levels for all using (true);

-- INWARD_ENTRIES policies
create policy "All authenticated can read inward" on inward_entries for select using (auth.uid() is not null);
create policy "All authenticated can insert inward" on inward_entries for insert with check (auth.uid() is not null);
create policy "Only admins can update inward" on inward_entries for update using (is_admin());

-- OUTWARD_ENTRIES policies
create policy "All authenticated can read outward" on outward_entries for select using (auth.uid() is not null);
create policy "All authenticated can insert outward" on outward_entries for insert with check (auth.uid() is not null);
create policy "Only admins can update outward" on outward_entries for update using (is_admin());

-- ENTRY_BATCHES policies
create policy "All authenticated can read batches" on entry_batches for select using (auth.uid() is not null);
create policy "All authenticated can insert batches" on entry_batches for insert with check (auth.uid() is not null);
create policy "Only admins can update batches" on entry_batches for update using (is_admin());

-- BATCH_ITEMS policies
create policy "All authenticated can read batch items" on batch_items for select using (auth.uid() is not null);
create policy "All authenticated can insert batch items" on batch_items for insert with check (auth.uid() is not null);

-- STALL_SESSIONS policies
create policy "All authenticated can read stalls" on stall_sessions for select using (auth.uid() is not null);
create policy "All authenticated can insert stalls" on stall_sessions for insert with check (auth.uid() is not null);
create policy "Admins can update stalls" on stall_sessions for update using (is_admin() or auth.uid() = created_by);

-- STALL_ITEMS policies
create policy "All authenticated can read stall items" on stall_items for select using (auth.uid() is not null);
create policy "All authenticated can insert stall items" on stall_items for insert with check (auth.uid() is not null);
create policy "All authenticated can update stall items" on stall_items for update using (auth.uid() is not null);

-- WIP_CONVERSIONS policies
create policy "All authenticated can read conversions" on wip_conversions for select using (auth.uid() is not null);
create policy "All authenticated can insert conversions" on wip_conversions for insert with check (auth.uid() is not null);
create policy "Admins/creators can update conversions" on wip_conversions for update using (is_admin() or auth.uid() = created_by);

-- Enable realtime for stock_levels
alter publication supabase_realtime add table stock_levels;
alter publication supabase_realtime add table entry_batches;
