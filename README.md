# Smart Shoppingcart

Mobile app prototype for shared grocery lists, large-touch shopping mode, and supermarket route training.

## Current Status

This repository contains the first Expo/React Native starter and the Supabase V1 schema draft.

Implemented in the starter app:

- Browser-local persistence for the catalog, active list, trip state, filters, and checkout lock.
- Large product tiles for adding items.
- One-hand shopping mode.
- Pick, missing, skip, and undo actions.
- Training mode that records pick order.
- Route inference from picked product sections.
- Editable planning docs and Supabase migration draft.

## Setup

Install dependencies:

```powershell
npm install
```

Start the app:

```powershell
npm run start
```

Run type checks:

```powershell
npm run typecheck
```

## Supabase

The schema draft is available in two places:

- `docs/supabase-v1-schema.sql`
- `supabase/migrations/20260429214500_v1_schema.sql`

Prototype shared sync is in:

- `supabase/migrations/20260515090000_app_state_snapshots.sql`

Create `.env` from `.env.example` and set:

```powershell
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_SYNC_SPACE_ID=pedro-family
```

All phones using the same family code share the same prototype household state. The default code comes from `EXPO_PUBLIC_SYNC_SPACE_ID`, and it can also be changed on the app welcome screen.

Before public beta, tighten row-level-security policies by role and add invite acceptance flows.

## Product Docs

See `docs/v1-product-deployment-plan.md` for the product scope, screen map, release plan, and implementation backlog.

## Local Persistence

The web prototype saves state in browser local storage under `smart-shoppingcart:v1`.
This keeps changes after refresh while the Supabase sync layer is still being built.
