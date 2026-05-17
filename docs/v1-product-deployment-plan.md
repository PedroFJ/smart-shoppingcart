# Smart Shoppingcart - V1 Product and Deployment Plan

## Product Goal

Build a mobile app that helps a household maintain a shared grocery list, shop with large-finger-friendly controls, and learn reusable supermarket routes from real shopping trips.

The first release should prove the core loop:

1. Family members add products during the week.
2. A shopper opens the cart and chooses a supermarket itinerary.
3. The app sorts the cart by the learned store route.
4. The shopper checks off products in a simple shopping mode.
5. The app learns and improves the store layout from the pick order.
6. The next list starts from products not picked in the previous trip.

Price comparison and online availability are important, but they should be added after the list and routing loop feels reliable.

## V1 Scope

### Included

- User accounts.
- Household sharing.
- Shared shopping list.
- Shopping list starts empty; users explicitly add only products they want to buy.
- Predefined product catalog.
- Product brand preference.
- Product notes.
- Per-list item quantity label, defaulting to "1 un".
- Per-item alternative acceptance.
- Last picked date visible on product/list cards.
- Explicit new-product flow with brand, note, spelling, and category classification.
- Large tap-target product adding.
- Recently used and favorite products.
- Store profiles.
- Shopping mode with big rows and forgiving actions.
- Store selector lives in the cart; the planning list order is independent from supermarket layout.
- SuperCor starts with an aisle-level route: Frutas, Legumes, Peixaria, Conservas, Carne refrigerada, Talho, Azeites e Óleos, Charcutaria, Cereais, Leite e Café, Laticínios, Ovos, Congelados, Vinho/cerveja/águas, Arroz e massas, Produtos de banho, Higiene pessoal, Guardanapos e papel, Produtos de limpeza da casa, Pão.
- Fruit and vegetable section sorts fruit before vegetables by default.
- List cards can be manually moved up/down to override the default order.
- Training trips that record item pick order.
- Inferred store sections based on picked products.
- Editable, reusable itineraries per store.
- Mark product as missing/unavailable.
- Offline shopping mode cache.
- Picked products leave the next active list and become available again in Add.
- Missing, skipped, and unpicked products remain in the next active list.
- Family members can keep adding products while another user is picking in-store.
- The picker can press "A pagar!" to finish the current shopping run.

### Deferred

- Online supermarket scraping or integrations.
- Automatic price lookup.
- Cheapest basket optimizer.
- Barcode scanning.
- Voice add.
- Pantry inventory.
- Public layout marketplace.

## Core Concepts

### Household

A household is the shared space for family members, products, lists, stores, and learned routes.

### Product

A product can be generic or specific.

Examples:

- Generic: Milk
- Specific: Mimosa Meio-Gordo 1L

V1 should support generic products, optional preferred brands, and a per-list-item flag for whether alternatives are acceptable.

Examples:

- Milk, preferred brand Mimosa, alternatives not accepted.
- Yogurt, preferred brand Danone, alternatives accepted.
- Bananas, no preferred brand, alternatives accepted.
- Kiwis grandes, note "Não muito maduros".

### Store

A store is a real supermarket location or a reusable store template.

Examples:

- Continente Telheiras
- Pingo Doce Local
- Lidl Near Home

### Itinerary

An itinerary is a route through one store.

Examples:

- Full weekly shop
- Quick essentials
- Fresh food only
- Reverse route

### Training Trip

A training trip records the order in which products are picked. From this, the app infers section order for that store itinerary.

## Data Model

### users

Stores user identity and profile data.

Fields:

- id
- display_name
- email
- avatar_url
- created_at
- updated_at

### households

Fields:

- id
- name
- created_by_user_id
- created_at
- updated_at

### household_members

Fields:

- id
- household_id
- user_id
- role: owner, admin, member
- joined_at

### products

Global or household-specific product catalog.

Fields:

- id
- household_id: nullable for global starter catalog
- name
- brand
- note
- normalized_name
- default_section_id
- unit_label: optional, e.g. kg, pack, bottle
- default_quantity
- default_quantity_label
- default_accepts_alternatives
- last_picked_at
- is_favorite
- created_by_user_id
- created_at
- updated_at

### product_sections

High-level store/product sections.

Fields:

- id
- household_id: nullable for global starter sections
- name
- sort_hint
- created_at
- updated_at

Starter sections:

- Fruit and vegetables
- Bakery
- Meat and fish
- Dairy
- Pantry
- Drinks
- Frozen
- Cleaning
- Personal care
- Pets
- Checkout

### shopping_lists

Fields:

- id
- household_id
- name
- status: active, archived
- created_by_user_id
- created_at
- updated_at

### shopping_list_items

Fields:

- id
- shopping_list_id
- product_id
- preferred_brand
- accepts_alternatives
- quantity
- quantity_label
- note
- status: needed, picked, skipped, missing
- added_by_user_id
- picked_by_user_id
- picked_at
- last_picked_at
- missing_at
- created_at
- updated_at

### stores

Fields:

- id
- household_id
- name
- address_label
- created_by_user_id
- created_at
- updated_at

### store_itineraries

Fields:

- id
- store_id
- name
- is_default
- confidence_score
- created_from_training_trip_id
- created_at
- updated_at

### itinerary_sections

Ordered sections for a store itinerary.

Fields:

- id
- itinerary_id
- section_id
- position
- label_override
- created_at
- updated_at

### store_product_locations

Overrides when a product is not where its default section suggests.

Fields:

- id
- store_id
- itinerary_id
- product_id
- section_id
- position_hint
- confidence_score
- updated_from_training_trip_id
- created_at
- updated_at

### training_trips

Fields:

- id
- household_id
- store_id
- itinerary_id: nullable until saved
- shopping_list_id
- started_by_user_id
- status: active, completed, discarded
- started_at
- completed_at

### training_trip_picks

Fields:

- id
- training_trip_id
- shopping_list_item_id
- product_id
- inferred_section_id
- pick_order
- picked_at
- action: picked, skipped, missing

### missing_product_events

Fields:

- id
- household_id
- store_id
- product_id
- shopping_list_item_id
- reported_by_user_id
- note
- reported_at

## Route Inference

V1 inference should stay simple and explainable.

When a training trip completes:

1. Read products in pick order.
2. Map each product to a section.
3. Collapse repeated adjacent sections.
4. Count section transitions.
5. Propose a section order.
6. Let the user edit the order before saving.

Example:

Picked products:

- Bananas
- Apples
- Bread
- Milk
- Yogurt
- Pasta
- Detergent

Inferred sections:

- Fruit and vegetables
- Bakery
- Dairy
- Pantry
- Cleaning

The app should treat the learned route as a suggestion, not as an invisible algorithmic truth. The user can always drag sections up or down.

## Mobile Screen Map

### 1. Welcome and Sign In

Purpose:

- Create account.
- Join or create household.

Primary actions:

- Continue with email.
- Continue with Google or Apple.
- Join household invite.

### 2. Home

Purpose:

- Show active household list.
- Show next shopping action.

Primary actions:

- Add products.
- Start shopping.
- Choose store.

### 3. Add Products

Purpose:

- Add products without precision tapping.

UX rules:

- Product tiles should be large.
- The full tile is tappable.
- Search is available but not required.
- Recently used products appear first.
- Category filters use large segmented buttons or chips.
- Brand and alternative preference are visible without opening a detail screen.
- Product notes are visible without opening a detail screen.
- Last picked date is visible on product cards.

Primary actions:

- Tap product to add.
- Increase/decrease quantity.
- Toggle alternatives accepted.
- Favorite product.
- Use "Produto novo" only when the product is not already in the catalog.
- When a new product is added, infer spelling, brand, department, notes, and whether alternatives are acceptable.

### 4. Shopping List

Purpose:

- Review needed products before shopping.

Primary actions:

- Edit quantity.
- Quantity is edited directly on the list item and defaults to "1 un".
- Edit preferred brand.
- Edit note.
- Notes are edited directly on the list item with no separate detail screen.
- Toggle alternatives accepted.
- Remove item.
- Mark as priority.
- Start shopping mode.

### 5. Cart Store Selection

Purpose:

- Select the supermarket and itinerary used to order the cart.

Primary actions:

- Pick store inside the cart.
- Reorder the active cart by that store route.
- Start normal trip.
- Start training trip.

### 6. Shopping Mode

Purpose:

- In-store picking with one hand.

UX rules:

- Big rows.
- Full row tap marks picked.
- Large bottom actions.
- Undo is always visible after a pick.
- Missing and skip actions are easy but secondary.
- Screen should not require tiny checkbox taps.
- Brand requirement and alternative acceptance are visible on the next item card.
- Product notes are visible on the next item card.
- Last picked date is visible before marking the item picked.
- Supermarket selection is inside shopping mode; the planning list order stays independent from store layout.
- The cart shows product cards in store order, with per-card arrows for manual route adjustment and an "Apanhado" action on each card.
- "A pagar!" and undo stay at the top of the cart.
- "A pagar!" finishes the shopping run; picked products leave the next list, and unpicked products stay.

Primary actions:

- Picked.
- Missing.
- Skip for later.
- Undo.

### 7. Training Summary

Purpose:

- Show the inferred route after a training trip.

Primary actions:

- Save route.
- Adjust section order.
- Rename itinerary.
- Discard training trip.

### 8. Route Editor

Purpose:

- Edit itinerary order.

Primary actions:

- Drag sections.
- Add section.
- Rename section label for this store.
- Move product to another section.
- Save itinerary.

### 9. Missing Products

Purpose:

- Review products not found at a store.

Primary actions:

- Keep on list.
- Try another store.
- Mark as bought elsewhere.
- Add note.

### 10. Settings

Purpose:

- Manage household, catalog, stores, and account.

Primary actions:

- Invite household member.
- Manage products.
- Manage stores.
- Export data.

## V1 Interaction Rules

- No primary action should require precision tapping.
- Whole rows should be tappable when safe.
- Buttons used during shopping should be reachable from the lower half of the screen.
- Swipe actions may exist, but must not be required.
- Destructive actions need confirmation or undo.
- Shopping mode must work offline after the trip starts.
- The app should sync changes when the connection returns.

## Deployment Stack

Recommended stack:

- Mobile: React Native with Expo.
- Backend: Supabase.
- Database: PostgreSQL.
- Authentication: Supabase Auth.
- Realtime: Supabase Realtime.
- Offline cache: SQLite on device.
- Push notifications: Expo Notifications.
- Crash reporting: Sentry.
- Analytics: PostHog or Firebase Analytics.
- CI/CD: GitHub Actions and EAS Build.

## Environments

### dev

- Local development.
- Fake and seeded data.
- Experimental features.

### staging

- Private testing.
- Release candidates.
- Realistic data.

### production

- Real users.
- Backups enabled.
- Monitoring enabled.

## Release Plan

### Prototype Release

Audience:

- Your household.

Goal:

- Replace OneNote for one week and one full shopping trip.

Includes:

- Shared list.
- Product catalog.
- Add products.
- Shopping mode.
- Training trip.
- Save inferred itinerary.

### Private Beta

Audience:

- 5 to 10 households.

Goal:

- Validate different family behaviors and supermarket layouts.

Includes:

- Household invites.
- Multiple stores.
- Multiple itineraries.
- Offline improvements.
- Missing product history.
- Basic analytics and crash reporting.

### Public MVP

Audience:

- App Store and Google Play users.

Goal:

- Ship a focused, polished grocery route planner.

Includes:

- Store layout sharing.
- Better onboarding.
- Product favorites and recents.
- Privacy policy.
- Support and feedback flow.

## Implementation Backlog

### Milestone 1: Project Foundation

- Create Expo app.
- Add TypeScript.
- Add navigation.
- Add base design tokens.
- Add Supabase client.
- Add local SQLite storage layer.
- Add environment configuration.

### Milestone 2: Data and Auth

- Create Supabase schema.
- Add row-level security.
- Add user signup and login.
- Add household creation.
- Add household invite flow.
- Seed starter product sections.
- Seed starter product catalog.

### Milestone 3: Shared List

- Add active shopping list.
- Add product browsing.
- Add search.
- Add recent products.
- Add quantity controls.
- Add item status changes.
- Add realtime list sync.

### Milestone 4: Shopping Mode

- Add store selection.
- Add itinerary selection.
- Sort cart by selected supermarket itinerary.
- Build large-row shopping mode.
- Add picked, missing, skipped, and undo actions.
- Add "A pagar!" finish-shopping action.
- Add offline trip cache.

### Milestone 5: Training Mode

- Record pick order.
- Infer section order.
- Show training summary.
- Save itinerary.
- Edit itinerary section order.
- Apply route to future lists.

### Milestone 6: Beta Readiness

- Add crash reporting.
- Add basic analytics.
- Add staging and production configs.
- Add EAS build profiles.
- Add TestFlight and Android closed testing setup.
- Add backup and restore checks.

## First Build Acceptance Criteria

The prototype is successful when:

- A household can add products throughout the week.
- The next active list starts with previous missing, skipped, or unpicked products.
- Products picked in the previous trip are available from Add instead of appearing in the active list.
- The active list syncs across at least two devices.
- A shopper can start a training trip in a store.
- The app records pick order without extra manual work.
- The app proposes a route after the trip.
- The route can be adjusted and reused.
- The next trip list is sorted by that saved route.
- Shopping mode can be used comfortably with one hand.
