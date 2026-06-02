-- ============================================================
-- Migration 006: Entry Batch Reversals
-- Run this in Supabase SQL Editor
-- Adds reversal tracking so approved entries can be undone.
-- ============================================================

-- Add reversal columns to entry_batches
alter table entry_batches
  add column if not exists is_reversed boolean not null default false,
  add column if not exists reversed_by uuid references profiles(id),
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_note text,
  add column if not exists reversal_of uuid references entry_batches(id);

-- Index to quickly find reversals of a given batch
create index if not exists idx_entry_batches_reversal_of
  on entry_batches(reversal_of)
  where reversal_of is not null;

-- Allow admins to update (reverse) batches via service role
-- The existing "Only admins can update batches" policy covers this already.
-- No new policies needed — service role bypasses RLS.
