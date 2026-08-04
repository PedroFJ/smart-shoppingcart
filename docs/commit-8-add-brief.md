# Commit 8 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 8 (Add, swapped behind Shop on 2026-08-03).
**Anchored at:** `origin/master` = `a25c768` (`Pass 1 commit 7b`). `App.tsx` is 3,477 lines. Re-grep before every edit.
**Goal:** move Add and its two inline forms out of the monolith — and first, stop the extraction from accumulating copies of shared code.

**This brief covers three commits: 7c, 8a and 8b.** Commit and verify each before starting the next. §1 and §2 explain why.

---

## 0. Pre-flight

```
pwd                         # C:\Users\PedroFreire\dev\smart-shoppingcart
git log --oneline -1        # a25c768
git fetch && git status -sb # up to date with origin/master
npm run typecheck           # green before you start
```

No modified tracked files under `App.tsx`, `app/`, `src/` or `supabase/`. Commit and push this brief and its plan entry before executing it.

---

# Commit 7c — Restore the "no trip" / "empty trip" distinction

Small, and it belongs to 7b rather than to Add. Do it first and on its own commit so it stays bisectable.

## 1. The defect

`App.tsx` before 7b (`5596024`:946) read:

```ts
const tripItemIds = activeTripItemIds ?? lockedPickingIds;   // Set<string> | null
```

`useTripLifecycle.ts:262` now reads:

```ts
const tripIds = tripState.activeTripItemIds.length > 0 ? tripState.activeTripItemIds : tripState.lockedPickingIds;
const tripItemIds = tripIds.length > 0 ? new Set(tripIds) : null;
```

`buildNextShoppingList` (`src/domain/tripList.ts`) branches on exactly that argument:

```ts
const wasInTrip = tripItemIds?.has(item.id) ?? true;
```

- An **empty `Set`** means "the trip contained nothing" → only `needed` items carry to the next list.
- **`null`** means "there was no trip boundary" → `needed`, `missing` *and* `skipped` all carry.

Before 7b, `startShoppingTrip` set `activeTripItemIds` to `new Set([])` when the list had no `needed` items — an empty Set, not null — so that case took the strict branch. After 7b the same case produces `null` and takes the permissive branch.

**Reproduction:** postpone every item so the list has no `needed` products, open the cart, press `A pagar!` and confirm. Before 7b the postponed items were dropped from the next list; now they return as `needed`.

## 2. Why it is not simply a bug to squash

The new behaviour is arguably the better one — postponed items coming back is friendlier than silently dropping them. The problem is that nobody chose it. It fell out of `tripStore` representing these collections as `string[]` (scaffolded that way back in Commit 2), which makes "no trip" and "empty trip" indistinguishable at the type level.

**Decide deliberately, then encode the decision so it cannot drift again:**

- Add an explicit `hasActiveTrip: boolean` to `tripStore`, or make `activeTripItemIds` nullable. Either restores the distinction the `Set | null` type used to carry.
- Set it in `startShoppingTrip`, clear it in `resetTrip`.
- Pass `null` to `buildNextShoppingList` only when there genuinely was no trip.
- Record in the execution log which behaviour you kept for the empty-trip case and why.

Do not paper over it at the call site with another `.length` check — that re-encodes the same ambiguity one level up.

## 3. Verification for 7c

1. Postpone every item, open the cart, check out. Confirm the next list matches whichever behaviour you chose, and say which.
2. Normal trip with picks still rebuilds correctly.
3. Standard gates, bundle loading unmodified.

---

# Commit 8a — Stop duplicating shared code

## 4. The finding

Each extraction so far has copy-pasted its helpers out of `App.tsx` instead of importing them. Audit at `a25c768`:

| Helper | App.tsx | list.tsx | shop.tsx |
|---|---|---|---|
| `getSectionCardStyle` | 2239 | 444 | 313 |
| `filterBySearch` | 1874 | 339 | — |
| `matchesSearchGroups` | 1898 | 363 | — |
| `parseSearchQuery` | 1915 | 380 | — |
| `isSearchAndOperator` | 1961 | 426 | — |
| `isSearchOrOperator` | 1965 | 430 | — |
| `normalizeForMatching` | 2225 | 434 | — |
| `normalizeQuantityText` | 1832 | 307 | — |
| `getProductSortLabel` | 1244 | 253 | — |
| `getFruitVegSortPrefix` | 1252 | 261 | — |
| `sortShoppingItems` | *(moved to `src/domain/routeOrdering.ts` by 7a)* | 234 | — |
| `searchStopWords` | 104 | 24 | — |
| `formatItemDetails` | 1822 | — | 308 |
| `formatListItemDetails` | 1827 | 302 | — |

I hashed each pair: **every copy is still byte-identical except `sortShoppingItems`**, which gained a `locale` parameter in `list.tsx` and no longer matches. So there is no live bug today — but drift has already started, in the one helper that got touched.

This matters more than it looks. Commit 11's definition of done is that `App.tsx` no longer exists. If the duplicates are still in place then, the copies *become* the permanent implementation — three separate `getSectionCardStyle` functions with no shared origin, and no reason for anyone to keep them in step. Add would make it four.

**So de-duplicate before Add, not after.**

## 5. What to create

Move each helper to a shared module, delete every copy, and have `App.tsx`, `list.tsx` and `shop.tsx` import it.

- **`src/domain/search.ts`** — `filterBySearch`, `matchesSearchGroups`, `parseSearchQuery`, `isSearchAndOperator`, `isSearchOrOperator`, `normalizeForMatching`, `searchStopWords`.
- **`src/domain/productFormat.ts`** — `normalizeQuantityText` (1832), `formatProductDetails` (1817), `formatItemDetails` (1822), `formatListItemDetails` (1827), `formatLastPicked` (1846), `formatLastPickedShort` (1860), `getProductSortLabel` (1244), `getFruitVegSortPrefix` (1252), `includesAny` (1240).
- **`src/ui/sectionStyles.ts`** — `getSectionCardStyle`. It returns a style object, so it belongs under `src/ui/`, not `src/domain/`.

Keep the moves verbatim. This commit changes no behaviour.

### 5.1 Settle `sortShoppingItems`

7a deliberately left this for "Commit 8 or 11". Settle it now.

`list.tsx:234` takes `(items, route, locale)` and uses locale-aware collation; `src/domain/routeOrdering.ts` takes `(items, route)` and does not. **Keep the locale-aware version** — it is the newer, more correct one for a pt-PT-first product, and `App.tsx` already has the locale available via `settingsStore`.

Make the shared signature `(items, route, locale)`, update both call sites, delete the `list.tsx` copy. Sorting is user-visible, so this is the one behaviour change 8a is allowed to make — call it out explicitly in the log and check the List order by eye before and after.

## 6. Verification for 8a

1. `grep -rn "^function getSectionCardStyle\|^function filterBySearch\|^function normalizeQuantityText" App.tsx app/ src/` returns exactly one hit each.
2. `npm run typecheck`, `npm run i18n:check`, export, bundle loads unmodified.
3. List: search with a two-word query, with `E`/`OU` operators, and with an accented term; confirm results match the pre-commit behaviour.
4. List and Shop: section card colours unchanged across all eleven sections.
5. List order re-checked after §5.1 and confirmed by eye.

**Commit and push 8a before starting 8b.**

---

# Commit 8b — Add becomes a route

## 7. Routes to create

```
app/(app)/(tabs)/add.tsx                   ← the AddScreen body (App.tsx:841–~1228)
app/(app)/products/new.tsx                 ← the "Produto novo" form, modal
app/(app)/products/[productId]/edit.tsx    ← the card-edit form, modal
```

Register `add` in `app/(app)/(tabs)/_layout.tsx` beside `list` and `shop`. Give `products` a `_layout.tsx` stack with `presentation: "modal"`.

Unlike Shop, `[productId]` here **is** justified: the edit form is per-product and the id is genuinely the route's subject.

Replace the `screen === "add"` branch (App.tsx:676–690) with `<Redirect href="/add" />`.

## 8. The two inline forms

Both currently live inside `AddScreen` as conditional blocks:

- **"Produto novo"** — App.tsx:1077–~1118, driven by `newProductName` / `newProductQuantity` / `newProductNote` / `isNewProductOpen` (866–869).
- **Card edit** — App.tsx:1120–~1160, driven by `editingProductId` / `editDraft` (870–871).

Moving them to modal routes means their state stops being screen-local. Keep the draft state **inside each modal route** — it is genuinely local UI state, not app-wide, and it must not go into a store. On dismiss the draft is discarded; that is correct behaviour, not data loss.

`createAndAddProduct` (App.tsx:575) currently ends by navigating to List with the filter and search pre-set. Preserve that: after creating, the modal dismisses and lands on `/list` with `departmentFilter` and `listSearch` set through `settingsStore`, exactly as today.

## 9. Product classification stays pure — move it in 8b

`classifyNewProduct` (1969) and its cluster — `extractParentheticalNote` (1999), `detectBrand` (2014), `removeDetectedBrand` (2039), `detectSectionId` (2047), `isSpecificProduct` (2107), `isUsefulProductName` (2114), `tidyProductName` (2120), `correctPortugueseGroceryText` (2162), `tidyBrandName` (2179), `createProductId` (2202), `normalizeProductId` (2216), `escapeRegExp` (2235) — are pure and total about 270 lines.

Move them to **`src/domain/productClassification.ts`**. They could have gone in 8a; they belong here because only Add consumes them, so moving them alongside their single consumer keeps the diff coherent.

This cluster is the most linguistically opinionated code in the app — Portuguese grocery-name tidying, brand detection, section inference. **Move it verbatim.** If you spot a bug in it, note it in the log; do not fix it inside an extraction commit.

## 10. Store wiring

| Screen state | Store |
|---|---|
| `products` | `productsStore` — `upsertProduct`, `deleteProduct` exist |
| `listProductIds` (App.tsx:455) | derive from `shoppingListStore.shoppingItems` |
| `departmentFilter`, `addSearch` | `settingsStore` — write through, never a local `useState` |
| `voiceSearchEnabled` | `settingsStore` |
| adding to the list | `shoppingListStore` |

`updateCatalogProduct` (591) and `deleteCatalogProduct` (610) each touch two or three stores — products, shopping list, and for delete also `routesStore.pickEvents`. Put them where 7b put its equivalents rather than inventing a second pattern: either extend the relevant store actions or add to the lifecycle-hook approach `useTripLifecycle` established. State which you chose.

Note `deleteCatalogProduct` deletes the product's pick history. That is intended — it is why the action needs the two-step confirm below.

## 11. FlatList migration

The plan assigns this here (review §3.7). Add is the screen that grows with the household's catalog, and it currently renders every product through `ScrollView` + `.map()`.

Migrate the catalog grid to `FlatList` with `keyExtractor` and a stable `renderItem`. **Do not** migrate List or Shop in this commit — the cart's drag-and-drop interacts with scroll containers and that is W4's problem.

If the modal-route change and the `FlatList` change together make the diff hard to review, land the `FlatList` as `8c`. Say so rather than bundling.

## 12. What must survive the move

1. **The two-step `Apagar` confirm** from 5.6 — `pendingDeleteProductId` (872), the 4-second timeout, the `Apagar mesmo` confirm and `X` cancel, on web and native. The web branch uses raw DOM `createElement` under `Platform.OS === "web"` (986). Carry it across; do not let `onPressIn` reappear.
2. **44 pt minimum** on `catalogSmallAction` (2924) — the `Editar` and `Apagar` controls.
3. **Voice search** on the Add search field, via `useVoiceSearch` (App.tsx:884).
4. **Products already on the list are hidden** from Add — `addableProducts` (878). This is Welcome's promise to the user; if it breaks, the onboarding copy becomes a lie.
5. **`createAndAddProduct`'s post-create navigation** — §8.

## 13. i18n

`src/i18n/locales/pt-PT/add.json` and `en/add.json` are both `{}`. Populate both, following the shape Commits 6 and 7b used. Correct any accent errors as you move strings rather than carrying them across — Commit 4 taught us that lesson.

## 14. Out of scope

- **List and Shop `FlatList`.** §11.
- **Fixing anything in the classification cluster.** §9.
- **The undo snackbar.** Still deferred from 7b.
- **Deleting `App.tsx`.** Commit 11. After 8b the monolith owns no screens — every branch is a `<Redirect>` — but it still holds persistence, sync and the remaining helpers.

## 15. Verification for 8b

1. Add a catalog product to the list; it disappears from Add.
2. Create a new product via the modal: it is classified, added, and lands on `/list` with the filter and search set.
3. Create a product with a parenthetical note and a brand — confirm `classifyNewProduct` still tidies the name and infers the section as before.
4. Edit a product from a card; the list item reflects the change but keeps its own quantity, note and `acceptsAlternatives`.
5. Delete a product: two taps required, timeout reverts, and the product plus its list item and pick history are gone.
6. Catalog scrolls smoothly with the full starter catalog after the `FlatList` change.
7. Voice search still populates the Add field (native only — say so if unavailable).
8. Gates, and the bundle loads unmodified.

## 16. Definition of done

1. 7c, 8a and 8b are separate commits, each green, each pushed.
2. No helper listed in §4 exists more than once in the repo.
3. `sortShoppingItems` has one implementation, locale-aware.
4. Add, the new-product form and the edit form are routes; `App.tsx` has a `<Redirect>` for `add` and declares no screens.
5. All five items in §12 verified by use.
6. `add.json` populated in both locales.
7. The log records the 7c behaviour decision, the §10 pattern choice, and any bug spotted-but-not-fixed in the classification cluster.

## 17. Where this is easy to get wrong

- **De-duplicating by deleting the wrong copy.** `sortShoppingItems` is the one pair that genuinely differs. Everything else is byte-identical — verify with a hash before deleting, do not eyeball it.
- **Putting modal draft state in a store.** §8. It is local UI state; a store makes an abandoned draft survive dismissal.
- **Losing the "already on the list" filter.** §12.4. Silent, and it contradicts the onboarding copy.
- **Bundling `FlatList` into an already-large diff.** §11 — split to 8c instead.
- **Trusting these line numbers.** Correct at `a25c768`; wrong as soon as you edit.
