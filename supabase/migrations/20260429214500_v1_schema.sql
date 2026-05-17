-- Smart Shoppingcart V1 Supabase schema draft.
-- This is intended as a starting migration, not yet tuned for production.

create extension if not exists "pgcrypto";

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.household_role as enum ('owner', 'admin', 'member');

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.product_sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  sort_hint integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  brand text,
  note text,
  normalized_name text not null,
  default_section_id uuid references public.product_sections(id),
  unit_label text,
  default_quantity numeric(10, 2) not null default 1,
  default_quantity_label text not null default '1 un',
  default_accepts_alternatives boolean not null default true,
  last_picked_at timestamptz,
  is_favorite boolean not null default false,
  created_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.shopping_list_status as enum ('active', 'archived');

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  status public.shopping_list_status not null default 'active',
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.shopping_item_status as enum ('needed', 'picked', 'skipped', 'missing');

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid not null references public.products(id),
  preferred_brand text,
  accepts_alternatives boolean not null default true,
  quantity numeric(10, 2) not null default 1,
  quantity_label text not null default '1 un',
  note text,
  status public.shopping_item_status not null default 'needed',
  added_by_user_id uuid not null references public.users(id),
  picked_by_user_id uuid references public.users(id),
  picked_at timestamptz,
  last_picked_at timestamptz,
  missing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  address_label text,
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_itineraries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  confidence_score numeric(4, 3) not null default 0,
  created_from_training_trip_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.itinerary_sections (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.store_itineraries(id) on delete cascade,
  section_id uuid not null references public.product_sections(id),
  position integer not null,
  label_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (itinerary_id, section_id),
  unique (itinerary_id, position)
);

create table public.store_product_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  itinerary_id uuid references public.store_itineraries(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  section_id uuid not null references public.product_sections(id),
  position_hint integer,
  confidence_score numeric(4, 3) not null default 0,
  updated_from_training_trip_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, itinerary_id, product_id)
);

create type public.training_trip_status as enum ('active', 'completed', 'discarded');

create table public.training_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  itinerary_id uuid references public.store_itineraries(id),
  shopping_list_id uuid not null references public.shopping_lists(id),
  started_by_user_id uuid not null references public.users(id),
  status public.training_trip_status not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create type public.training_pick_action as enum ('picked', 'skipped', 'missing');

create table public.training_trip_picks (
  id uuid primary key default gen_random_uuid(),
  training_trip_id uuid not null references public.training_trips(id) on delete cascade,
  shopping_list_item_id uuid not null references public.shopping_list_items(id),
  product_id uuid not null references public.products(id),
  inferred_section_id uuid references public.product_sections(id),
  pick_order integer not null,
  picked_at timestamptz not null default now(),
  action public.training_pick_action not null,
  unique (training_trip_id, shopping_list_item_id),
  unique (training_trip_id, pick_order)
);

create table public.missing_product_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id),
  shopping_list_item_id uuid references public.shopping_list_items(id),
  reported_by_user_id uuid not null references public.users(id),
  note text,
  reported_at timestamptz not null default now()
);

create index idx_household_members_user_id on public.household_members(user_id);
create index idx_products_household_id on public.products(household_id);
create index idx_products_normalized_name on public.products(normalized_name);
create index idx_shopping_lists_household_status on public.shopping_lists(household_id, status);
create index idx_shopping_list_items_list_status on public.shopping_list_items(shopping_list_id, status);
create index idx_stores_household_id on public.stores(household_id);
create index idx_itinerary_sections_order on public.itinerary_sections(itinerary_id, position);
create index idx_training_trip_picks_order on public.training_trip_picks(training_trip_id, pick_order);
create index idx_missing_product_events_store_product on public.missing_product_events(store_id, product_id, reported_at desc);

alter table public.users enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.product_sections enable row level security;
alter table public.products enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.stores enable row level security;
alter table public.store_itineraries enable row level security;
alter table public.itinerary_sections enable row level security;
alter table public.store_product_locations enable row level security;
alter table public.training_trips enable row level security;
alter table public.training_trip_picks enable row level security;
alter table public.missing_product_events enable row level security;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

-- RLS policy draft.
-- These broad household-member policies are intentionally simple for V1.
-- Tighten write policies by role before public launch.

create policy "Users can view own profile"
on public.users for select
using (id = auth.uid());

create policy "Users can update own profile"
on public.users for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Members can view households"
on public.households for select
using (public.is_household_member(id));

create policy "Creators can create households"
on public.households for insert
with check (created_by_user_id = auth.uid());

create policy "Members can view membership"
on public.household_members for select
using (public.is_household_member(household_id) or user_id = auth.uid());

create policy "Members can manage household product sections"
on public.product_sections for all
using (household_id is null or public.is_household_member(household_id))
with check (household_id is null or public.is_household_member(household_id));

create policy "Members can manage household products"
on public.products for all
using (household_id is null or public.is_household_member(household_id))
with check (household_id is null or public.is_household_member(household_id));

create policy "Members can manage shopping lists"
on public.shopping_lists for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can manage shopping list items"
on public.shopping_list_items for all
using (
  exists (
    select 1
    from public.shopping_lists sl
    where sl.id = shopping_list_id
      and public.is_household_member(sl.household_id)
  )
)
with check (
  exists (
    select 1
    from public.shopping_lists sl
    where sl.id = shopping_list_id
      and public.is_household_member(sl.household_id)
  )
);

create policy "Members can manage stores"
on public.stores for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can manage itineraries"
on public.store_itineraries for all
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_id
      and public.is_household_member(s.household_id)
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_id
      and public.is_household_member(s.household_id)
  )
);

create policy "Members can manage itinerary sections"
on public.itinerary_sections for all
using (
  exists (
    select 1
    from public.store_itineraries si
    join public.stores s on s.id = si.store_id
    where si.id = itinerary_id
      and public.is_household_member(s.household_id)
  )
)
with check (
  exists (
    select 1
    from public.store_itineraries si
    join public.stores s on s.id = si.store_id
    where si.id = itinerary_id
      and public.is_household_member(s.household_id)
  )
);

create policy "Members can manage store product locations"
on public.store_product_locations for all
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_id
      and public.is_household_member(s.household_id)
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_id
      and public.is_household_member(s.household_id)
  )
);

create policy "Members can manage training trips"
on public.training_trips for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can manage training trip picks"
on public.training_trip_picks for all
using (
  exists (
    select 1
    from public.training_trips tt
    where tt.id = training_trip_id
      and public.is_household_member(tt.household_id)
  )
)
with check (
  exists (
    select 1
    from public.training_trips tt
    where tt.id = training_trip_id
      and public.is_household_member(tt.household_id)
  )
);

create policy "Members can manage missing product events"
on public.missing_product_events for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

insert into public.product_sections (name, sort_hint) values
  ('Fruit and vegetables', 10),
  ('Bakery', 20),
  ('Meat and fish', 30),
  ('Dairy', 40),
  ('Pantry', 50),
  ('Drinks', 60),
  ('Frozen', 70),
  ('Cleaning', 80),
  ('Personal care', 90),
  ('Pets', 100),
  ('Household', 110),
  ('Checkout', 120);
