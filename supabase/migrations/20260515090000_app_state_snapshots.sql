-- Shared prototype sync for Smart Shoppingcart.
-- One row stores the current household app state while the product/list model is still evolving.

create table if not exists public.app_state_snapshots (
  id text primary key,
  state jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.app_state_snapshots enable row level security;

drop policy if exists "Prototype clients can read app state snapshots"
on public.app_state_snapshots;

drop policy if exists "Prototype clients can write app state snapshots"
on public.app_state_snapshots;

create policy "Prototype clients can read app state snapshots"
on public.app_state_snapshots for select
using (true);

create policy "Prototype clients can write app state snapshots"
on public.app_state_snapshots for all
using (true)
with check (true);
