# Commit 7 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 7 (Shop, swapped ahead of Add on 2026-08-03).
**Anchored at:** `origin/master` = `5596024` (`Pass 1 commit 5.7`). `App.tsx` is 4,487 lines. Re-grep before every edit; your own changes will move these numbers.
**Goal:** move the Shop entry, the cart, the route editor and the trip summary out of the monolith.

**This brief covers two commits, 7a and 7b.** Commit and verify 7a before starting 7b. §1 explains why it is split.

---

## 0. Pre-flight

```
pwd                         # C:\Users\PedroFreire\dev\smart-shoppingcart
git log --oneline -1        # 5596024
git fetch && git status -sb # up to date with origin/master
npm run typecheck           # green before you start
```

Commit this brief and its plan entry **before** executing it. A brief that is not on `origin/master` does not exist — that is how the Commit 5.7 blocker got skipped.

---

## 1. Why this is two commits, not one

Commit 7 as written in the plan is the largest extraction in Pass 1. Measured at `5596024`:

| Piece | Location | Size |
|---|---|---|
| `ShopScreen` | App.tsx:1572–1949 | ~378 lines |
| `SummaryScreen` + `getConfidenceBand` | App.tsx:1950–2014 | ~65 lines |
| Route/ordering helpers | App.tsx:2026–2170 | ~145 lines |
| Trip + cart handlers | scattered, App.tsx:571–965 | ~200 lines |

Doing it in one commit produces a ~900-line diff that cannot be reviewed against a green baseline. Worse, it hides the actual hazard, which is §1.1.

### 1.1 The hazard: Shop produces what Summary consumes

`pickEvents` is written by the cart (via `updateItemStatus`, App.tsx:663) and read by the summary (via `inferredRoute`, App.tsx:490). Today both live in `App.tsx` and share one `useState` (App.tsx:314).

**The plan schedules Shop as Commit 7 and Summary as Commit 9.** If Shop moves to a route that writes `pickEvents` into `routesStore`, while the monolith's summary keeps reading its own `useState`, then finishing a trip shows a summary built from an empty array. Route learning — the feature Commit 5.6 just made reachable for the first time — breaks silently, with a green typecheck and a passing web smoke, because nothing throws. It renders an empty route.

This is the Commit 5.5 bug in a new costume: two writers, one of them stale, no error.

**So Summary moves with Shop.** Commit 9 does not disappear; it shrinks to the *added* V1 actions it was always meant to introduce (rename itinerary, discard training trip, adjust order inline). Update the plan's Commit 9 entry to say so.

### 1.2 The split

- **Commit 7a — pure helpers to `src/domain/`.** No UI moves, no store wiring, no behaviour change. Mechanical and reviewable on its own; it also removes most of 7b's bulk.
- **Commit 7b — Shop, cart, route editor and Summary become routes.** The screens that consume the helpers 7a just extracted.

---

# Commit 7a — Extract the route and ordering domain

**Zero behaviour change.** `App.tsx` keeps rendering every screen it renders today; it just imports the helpers instead of declaring them.

## 2. What moves

Create `src/domain/routeOrdering.ts` and move these verbatim from `App.tsx`. They are already pure functions of their arguments — none reads component state.

| Function | App.tsx line |
|---|---|
| `sortShoppingItems` | 2026 |
| `sortPickingItems` | 2045 |
| `sortSupercorPickingItems` | 2050 |
| `applyManualProductOrder` | 2067 |
| `clampIndex` | 2082 |
| `completeSectionRoute` | 2090 |
| `completeStoreStopOrder` | 2099 |
| `getRouteEditorItems` | 2108 |
| `areSectionRoutesEqual` | 2122 |
| `isSupercorStopId` | 2130 |
| `getStoreRouteHint` | 2134 |
| `getFallbackStoreRouteNames` | 2143 |
| `getStoreStopName` | 2151 |
| `getSupercorStopName` | 2160 |
| `getSupercorRouteStopId` | 2164 |

Move the `CART_DRAG_STEP` constant alongside them.

`App.tsx` imports what it still uses. Nothing else changes.

### 2.1 The one that is not pure

`buildNextShoppingList` (App.tsx:571) is declared **inside** the component, so check what it closes over before moving it. If it only reads its two parameters, move it to `src/domain/tripList.ts`. If it captures component state, leave it where it is and note that in the log — 7b will deal with it.

Do not "fix" it by threading the captured values through as parameters in this commit. That is a behaviour-relevant refactor and it does not belong in a mechanical move.

### 2.2 Do not de-duplicate `sortShoppingItems` yet

`app/(app)/(tabs)/list.tsx` has its own `sortShoppingItems` with a `locale` parameter that the monolith's version does not take. They have diverged. **Leave both.** Reconciling them is a behaviour question (which locale collation is correct?), not a move, and doing it here would put a subtle sort change inside a commit whose whole claim is that nothing changed.

Note the divergence in the execution log so Commit 8 or 11 can settle it deliberately.

## 3. Verification for 7a

1. `npm run typecheck` passes.
2. `npm run i18n:check` passes.
3. `npx expo export --platform web --clear` passes **and the bundle loads unmodified** — the 5.7 rule applies to every commit from here.
4. `git diff --stat` shows only `App.tsx`, the new `src/domain/*` files, and the plan. If any file under `app/` or `src/state/` changed, you have gone too far.
5. A cart smoke: start a trip, reorder two items with the arrows, drag one card, confirm order persists. This exercises the moved helpers through the unchanged UI.

**Commit and push 7a before starting 7b.**

---

# Commit 7b — Shop, cart, route editor and Summary as routes

## 4. Routes to create

```
app/(app)/(tabs)/shop.tsx                  ← store picker + cart (the ShopScreen body)
app/(app)/shop/route-editor.tsx            ← the inline route editor, modal-presented
app/(app)/shop/summary.tsx                 ← SummaryScreen
```

Register `shop` in `app/(app)/(tabs)/_layout.tsx` beside `list`, following the existing `Tabs.Screen` pattern. Present `route-editor` with `presentation: "modal"` in a `app/(app)/shop/_layout.tsx` stack.

The plan's target tree uses `shop/[storeId]/…`. **Do not introduce the `[storeId]` segment in this commit.** The selected store is a single value in `storesStore`, not a URL parameter, and inventing a route parameter that nothing links to adds a redirect problem for no gain. If per-store deep links are wanted later, that is its own change.

## 5. Store wiring

Everything Shop needs already has a home. Nothing new should be added to `PersistedAppState`.

| Screen state | Store | Notes |
|---|---|---|
| `items` (App.tsx:481 `pickingItems`) | derived | `shoppingListStore.shoppingItems` + `sortPickingItems` from 7a |
| `selectedStoreId`, `storeItineraries`, `storeStopOrders`, `storeProductOrders` | `storesStore` | all four already exist with setters |
| `pickEvents`, `itinerary` | `routesStore` | already exist |
| `isCheckoutLocked`, `lockedPickingIds`, `activeTripItemIds` | `tripStore` | already exist, plus `resetTrip()` |
| `lastChange` (undo) | `shoppingListStore` | `setLastChange` exists; `updateItemStatus` already sets it |
| `shoppingDoneNotice` | `shoppingListStore` | `setShoppingDoneNotice` exists |
| `departmentFilter`, `listSearch`, `addSearch` | `settingsStore` | moved there by 5.5 — write through the store, never a local `useState` |

Note `tripStore` stores `lockedPickingIds` / `activeTripItemIds` as `string[]`, while `App.tsx` uses `Set<string> | null` (App.tsx:321, 324). Convert at the boundary. `null` means "no trip"; the store's empty array should mean the same. Pick one representation inside the route and be consistent — do not carry both.

## 6. The trip lifecycle

These handlers move out of `App.tsx` and become a cross-store module. Put them in `src/domain/trip.ts` as plain functions that take the store setters, or in a `src/hooks/useTripLifecycle.ts` — your call, but they must live in **one** place, because they are the only code that touches five stores at once.

| Handler | App.tsx line |
|---|---|
| `updateItemStatus` | 663 — note `shoppingListStore` already has its own `updateItemStatus`; reconcile, do not duplicate |
| `movePickingItem` | 743 |
| `reorderPickingItem` | 764 |
| `updateSelectedStoreRouteFromProductOrder` | 785 |
| `moveStoreSection` | 826 |
| `undoLastChange` | 881 |
| `saveInferredRoute` | 906 |
| `startShoppingTrip` | 914 |
| `endShoppingTrip` | 934 |
| `finalizeShoppingTrip` | 945 |

### 6.1 `updateItemStatus` exists twice — this is the trap

`shoppingListStore.updateItemStatus` (added in Commit 6, used by List) and `App.tsx:663` are **not** equivalent. The monolith version additionally:

- stamps `defaultQuantity` and `lastPickedAt` onto the **product** for picked items;
- appends a `pickEvent`;
- sets `lastChange` for undo.

If the cart calls the store's simpler version, picks stop being recorded and route learning quietly stops working — again with no error. Either extend the store's action to do the full job (and confirm List still behaves), or give the cart a distinct, clearly named action. **Do not let the cart call the List version as-is.**

State in the execution log which you chose and why.

### 6.2 `finalizeShoppingTrip` touches five stores

App.tsx:945 currently calls eleven setters. After 7b it must do the same work across `productsStore`, `shoppingListStore`, `routesStore`, `tripStore` and `settingsStore`, then navigate to `/list`. Write it once, call it from both the summary's *save* and *discard* paths, exactly as 5.6 established.

Order matters: rebuild the list from `shoppingItems` **before** clearing `pickEvents` and the trip sets. Getting this backwards produces an empty next list, which looks like data loss to the household.

## 7. What must survive the move — check each one

Commit 4 carried the Welcome diacritics defect across verbatim; the same class of mistake in reverse would silently drop the 5.6 fixes. Every item below is currently in `App.tsx` and must be present in the new routes, verified by use and not by grep:

1. **Summary flow.** Finishing a trip with picks routes to the summary before `pickEvents` are cleared. No picks → straight to the list.
2. **Three summary exits** — `Guardar percurso`, `Terminar sem guardar`, `Voltar ao carrinho` — and the confidence band (`getConfidenceBand`, App.tsx:2003).
3. **`saveInferredRoute` writes only `storeItineraries[selectedStoreId]`.** It must not write the global `itinerary`. 5.6 deliberately removed that.
4. **`Falta`** on every cart row, undoable via `Desfazer última ação`.
5. **Touch targets**: arrows 48×48, `Apanhado` and `Falta` 102×48.
6. **Two-step checkout confirm**, with the 4-second timeout, on web and native. Carry the native branch across **without** `onPressIn` — 5.7 removed it, do not let it reappear from an older copy.
7. **The confirm's platform fork.** The web branch uses raw DOM `createElement` under `Platform.OS === "web"`. Carry it as-is; if you can collapse the fork to one `TouchableOpacity` implementation that passes on both, that is a welcome improvement — say so in the log rather than doing it silently.

## 8. i18n

`src/i18n/locales/pt-PT/shop.json` and `en/shop.json` are currently `{}`. Populate both, following the namespace shape Commit 6 used for `list.json`. `summary.json` likewise.

Every string moving out of `App.tsx` becomes a key. The pt-PT values are the existing strings **corrected** where they are wrong — do not carry a typo across for fidelity's sake. Check accents on every string you move.

## 9. Explicitly out of scope

- **The W4 Shopping Mode rewrite.** Keep the existing Responder-API drag code as-is inside the new file. No full-row tap-to-pick, no haptics, no section dividers, no swipe actions. The structural move is the *only* goal.
- **The undo snackbar.** The plan has the undo button becoming a `Snackbar` via `useUndoToast()` in the root layout. **Defer it.** It is a UX change, it needs a host component that does not exist, and 7b is already the largest commit in the pass. Keep the inline undo button. Give the snackbar its own commit after 7b, or fold it into W4.
- **`[storeId]` route parameters.** §4.
- **Reconciling the two `sortShoppingItems`.** §2.2.
- **`FlatList` migration.** Commit 8.
- **Deleting `App.tsx`.** Commit 11. After 7b the monolith still owns Add, and `screen === "shop"` / `"summary"` become `<Redirect>` branches like `list` and `settings` before them.

## 10. Verification for 7b

Beyond the standard gates, and all on the **unmodified** exported bundle:

1. **Full trip.** Add 3 products from different sections → cart → reorder one with arrows → drag another → mark all three `Apanhado` → `A pagar!` → confirm → summary shows a route and a band → `Guardar percurso` → next trip at the same store opens in the saved order.
2. **`Terminar sem guardar`** finalizes without changing the route.
3. **No-picks trip** skips the summary.
4. **`Falta`** → finish → item is on the next list → and `Desfazer` returns it to `needed`.
5. **Undo after a pick** restores both the item status and the product's `lastPickedAt`, and drops the pick event.
6. **Route editor** opens modally, reorders stops, and the cart order follows.
7. **Store switch** changes the cart order to that store's route.
8. **Reload mid-trip**: lock the checkout, reload, confirm the trip state survives via `tripStore`.
9. **List still works** — Commit 6's screen shares `shoppingListStore` with the cart; confirm §6.1 did not change its behaviour.
10. Native: unavailable in your environment. Say so explicitly rather than marking it passed.

## 11. Definition of done

1. 7a and 7b are two commits, each green, each pushed.
2. Shop, route editor and Summary are routes; `App.tsx` has `<Redirect>` branches for `shop` and `summary` and no longer declares those screens.
3. No screen file declares `useState` for app-wide data.
4. All seven items in §7 verified by use.
5. `shop.json` and `summary.json` are populated in both locales; `npm run i18n:check` passes.
6. The web bundle loads unmodified, console clean.
7. The execution log records the §6.1 decision and the §2.1 finding about `buildNextShoppingList`.

## 12. Where this is easy to get wrong

- **Letting the cart call `shoppingListStore.updateItemStatus` unchanged.** §6.1. Silent loss of route learning. This is the single most likely failure in this commit.
- **Moving Shop without Summary.** §1.1. Same failure, different cause.
- **Clearing `pickEvents` before the summary reads them.** 5.6 fixed this once; the move can reintroduce it.
- **`Set` vs `string[]` for the trip id collections.** §5. A `null`-vs-`[]` mismatch shows up as a trip that will not end.
- **Rebuilding the next list after clearing trip state.** §6.2. Looks like data loss.
- **Trusting these line numbers.** They are correct at `5596024` and wrong the moment you start editing.
