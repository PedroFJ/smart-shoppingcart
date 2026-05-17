# Pass 1 — `App.tsx` Split + i18n Foundation Plan

This document is the execution plan for **W1 (split the monolith with `expo-router`)** and **W2 (extract strings to an i18n catalogue)** of the UX/UI Pass 1 work. It targets Codex as the implementer; Claude is the planner.

The plan is deliberately ordered so every commit ships green: at no point does the app stop working. The monolithic `App.tsx` survives, in shrinking form, until the very last commit of the sequence.

---

## 1. Why these two workstreams must move together

Each screen extraction crosses a string boundary. If strings stay inline, the extracted file accumulates pt-PT JSX that someone has to revisit later. If we extract strings *as* we extract screens, the i18n catalogue grows organically and the second pass over each file is avoided. The two workstreams share the same touch surface, so the cost of bundling them is near-zero and the savings are real.

The same logic applies to **lifting state to stores**. The current `App.tsx` keeps ~20 `useState` calls in one component (App.tsx:159–211) and passes them as props into the screen functions. After the split, those props can't traverse `expo-router` boundaries cleanly. We need stores in place *before* the first screen is moved out.

---

## 2. Target architecture

### 2.1 File tree

```
app/                                     ← expo-router root
  _layout.tsx                            ← root: providers, fonts, status bar, sync init
  index.tsx                              ← entry redirector (auth? → /(auth)/welcome ; else → /(app)/home)

  (auth)/                                ← unauthenticated stack
    _layout.tsx                          ← stack header config, brand
    welcome.tsx                          ← Welcome / value-prop carousel
    sign-in.tsx                          ← Supabase Auth (email magic-link, Google, Apple)
    create-household.tsx                 ← post-signup household creation
    join-household.tsx                   ← redeem invite code / deeplink

  (app)/                                 ← authenticated app
    _layout.tsx                          ← tab bar (compact-aware), header with sync pill + settings
    (tabs)/
      home.tsx                           ← Home: active household, "Iniciar compra" CTA, next-trip preview
      list.tsx                           ← Shopping List (planning view)
      add.tsx                            ← Add Products
      shop/
        index.tsx                        ← Shop entry: pick store + itinerary, "Treino vs Normal"
        [storeId]/
          _layout.tsx                    ← shopping-mode header (sticky section, undo toast)
          index.tsx                      ← Shopping Mode (cart by store route)
          summary.tsx                    ← Training Summary / post-trip
          missing.tsx                    ← Missing Products review
          route-editor.tsx               ← Route Editor for this store (modal-presented)
    settings/
      index.tsx                          ← Settings root
      products.tsx                       ← Manage products (catalog admin)
      stores.tsx                         ← Manage stores
      household.tsx                      ← Manage members, leave/transfer
      account.tsx                        ← Sign out, delete account, export data
    products/
      new.tsx                            ← New product (modal)
      [productId]/edit.tsx               ← Edit product (modal)

src/
  i18n/
    index.ts                             ← i18next init, language detector, namespace registry
    locales/
      pt-PT/
        common.json                      ← Buttons, statuses, units, shared chrome
        welcome.json
        auth.json
        home.json
        list.json
        add.json
        shop.json
        summary.json
        route-editor.json
        missing.json
        settings.json
        errors.json
      en/                                ← Same namespaces, English source-of-truth
      pt-BR/                             ← Light fork of pt-PT (terminology overrides)
      es/                                ← Spanish for launch
  state/
    productsStore.ts                     ← Catalog
    shoppingListStore.ts                 ← Active list, statuses, undo stack
    storesStore.ts                       ← Store profiles, selected store, itineraries
    routesStore.ts                       ← Per-store learned routes, pick events
    tripStore.ts                         ← Active training/normal trip, lock state
    settingsStore.ts                     ← smartStart, voice, default store, family code
    syncStore.ts                         ← Supabase status, realtime channel, last sync
    authStore.ts                         ← (W5) user + household
    persistence.ts                       ← zustand persist middleware bound to deviceStorage
  hooks/
    useVoiceSearch.ts                    ← expo-speech-recognition wrapper, locale-aware
    useSyncSubscription.ts               ← Supabase realtime channel binding
    useCompactLayout.ts                  ← isCompactLayout flag from useWindowDimensions
    useUndoToast.ts                      ← snackbar / toast queue for "Apanhado" undo
    useHaptics.ts                        ← Platform-aware vibration / haptic feedback
  ui/
    tokens.ts                            ← spacing, radius, typography, semantic colours
    theme/
      lightTheme.ts
      darkTheme.ts                       ← (Pass 2, but tokens exposed in Pass 1)
    components/
      AppButton.tsx                      ← primary / secondary / destructive variants
      AppTextInput.tsx
      AppSwitch.tsx
      SectionChip.tsx
      EmptyState.tsx
      SyncPill.tsx
      Snackbar.tsx
      ScreenScaffold.tsx                 ← SafeArea + header + scroll wrapper
  domain/
    routeInference.ts                    ← unchanged
    listLifecycle.ts                     ← (extracted) buildNextShoppingList, normalize, etc.
  data/
    sampleData.ts                        ← unchanged
  lib/
    supabase.ts                          ← unchanged
    deviceStorage.ts / .native.ts        ← unchanged; consumed by state/persistence.ts
```

`App.tsx` ceases to exist at the end. `package.json` `main` flips from `expo/AppEntry` to `expo-router/entry`.

### 2.2 State store inventory

Each store is a zustand store with `persist` middleware bound to `src/lib/deviceStorage`. Stores expose **actions** and **selectors**; screens read with hook-selectors and never destructure the whole store.

| Store | Owns | Currently in App.tsx (lines) |
|---|---|---|
| `productsStore` | `products: Product[]`, CRUD, favourites, normalization | 194, 213 |
| `shoppingListStore` | `shoppingItems`, `lastChange` (undo), `shoppingDoneNotice`, `departmentFilter`, `listSearch`, `addSearch` | 195–203 |
| `storesStore` | `supermarketProfiles`, `selectedStoreId`, `storeStopOrders`, `storeProductOrders` | 115–122, 185–193 |
| `routesStore` | `itinerary`, `storeItineraries`, `pickEvents` | 181–184, 198 |
| `tripStore` | `isCheckoutLocked`, `lockedPickingIds`, `activeTripItemIds`, trip type (normal/training) | 204–210 |
| `settingsStore` | `userName`, `voiceSearchEnabled`, `defaultStoreId`, `smartStartEnabled`, locale | 81–86, 151–156, 168 |
| `syncStore` | `syncStatus`, `syncMessage`, `activeSyncSpaceId`, client id, last server `updated_at` | 177–180, 161–167 |
| `authStore` | (W5 — empty for now) user, household, members | — |

The four `useRef`-stored mutables (`syncClientId`, `remoteApplyInProgress`, `remoteReady`, `syncTimeout`, App.tsx:161–166) move into `syncStore`'s internal closure, not React refs.

### 2.3 Provider tree (root `app/_layout.tsx`)

```
<I18nextProvider>
  <ThemeProvider>                  ← Pass 1 stub: tokens only, Pass 2 fills dark mode
    <SafeAreaProvider>
      <SyncBootstrap>              ← reads syncStore, mounts useSyncSubscription
        <Stack> / <Tabs>           ← expo-router shell
          <SnackbarHost />         ← portal for undo toasts
        </Stack>
      </SyncBootstrap>
    </SafeAreaProvider>
  </ThemeProvider>
</I18nextProvider>
```

Zustand stores don't need providers — they're singletons imported directly. The only provider count growth is **i18next + theme + safe-area + snackbar host**. Auth context joins in W5.

### 2.4 i18n contract

- **Library**: `i18next` + `react-i18next` + `expo-localization` for device-locale detection.
- **Source locale**: `en` is the translator-facing source-of-truth namespace.
- **Runtime default locale**: `pt-PT` for the household testing build. `en` remains the fallback if a key is missing.
- **Locale forks**: `pt-BR` is a thin overlay over `pt-PT`, `es` is independent.
- **Namespace per screen**, plus `common`, `errors`. Screens use `useTranslation('list')` and call `t('emptyState.title')`.
- **No string concatenation across `t()` calls** — every full sentence is one key. ICU/i18next interpolation for product names, counts, dates.
- **Pluralization**: i18next built-in plural rules. Counts use `{{count}}`.
- **Dates and numbers**: `Intl.DateTimeFormat` / `Intl.NumberFormat` via the current locale; helper in `src/i18n/format.ts`.
- **Voice search locale**: read from `settingsStore.locale`, no longer hard-coded (App.tsx:101).
- **Pseudo-locale `de-pseudo`** that expands strings +35%: not shipped, but exercised in dev to catch overflow before real DE arrives.
- **CI guardrail**: a lint script (`npm run i18n:check`) that flags any new JSX text node not wrapped in `t(...)`.

---

## 3. Migration sequence — eleven commits, each shippable

Every commit must:
- Pass `npm run typecheck`.
- Render in Expo Go on iOS + Android + web without runtime errors.
- Leave the user-facing app fully functional (no regressions in flows the user already had).

Commits 1–3 set up infrastructure with **zero UX change**. Commits 4–10 are screen-by-screen extractions. Commit 11 deletes the monolith.

### Commit 1 — Install dependencies, switch entry to `expo-router`

- Add: `expo-router`, `react-native-screens`, `react-native-safe-area-context`, `zustand`, `immer`, `i18next`, `react-i18next`, `expo-localization`.
- Flip `package.json` → `"main": "expo-router/entry"`.
- Create `app/_layout.tsx` that **renders the existing `App` component verbatim** at the root index. The router is alive; the app still looks the same.
- Create `app/index.tsx` that re-exports the current `App.tsx` default export.
- No screen extraction yet. No store creation yet. The router shell exists; routes are placeholders.

**Risk**: Web bundler may need `metro.config.js` tweaks (`unstable_enablePackageExports`); test all three platforms.

### Commit 2 — Scaffold state stores (no consumers)

- Create the seven store files in `src/state/` with the full state shape and actions, but **no React component reads from them yet**. The monolith still holds the live values.
- Implement `state/persistence.ts` — a zustand storage adapter that calls `getDeviceLocalStorage()` from `src/lib/deviceStorage.ts`, preserving the current storage keys (App.tsx:95–98) so persisted data survives the migration.
- Add an "import legacy state" one-shot in each store that reads the existing `STORAGE_KEY` blob and hydrates the new stores. This runs once on first launch after the migration.

**Verification**: launch the app, confirm `STORAGE_KEY` blob is read, confirm each store reports the legacy values via a temporary debug log (removed in Commit 3).

### Commit 3 — Scaffold i18n catalogue (still no consumers)

- Create `src/i18n/index.ts` that initialises `i18next` with `en` and `pt-PT` namespaces (empty `.json` files for each screen).
- Wrap `app/_layout.tsx` in `<I18nextProvider>`.
- Add the synchronous legacy-store bootstrap guard in `app/_layout.tsx` before any routed screen can consume stores. This is intentionally early, before Commit 4 extracts Welcome.
- Add the `npm run i18n:check` script (a simple grep-based check that fails when JSX `<Text>…</Text>` literals appear in any file under `app/` or `src/state/`; warnings only at this stage).
- Document the locale-fallback policy in `src/i18n/README.md`.

After commit 3: infrastructure is in place; the monolith still owns every screen. We can now extract one screen at a time.

### Commit 4 — Extract **Welcome** (`(auth)/welcome.tsx`)

The simplest screen, no state mutations, no business logic. Used to pressure-test the extraction recipe.

For every screen extraction, the recipe is:
1. Create the new file under `app/`.
2. Copy the screen component out of `App.tsx`.
3. Replace prop access with store selectors and navigation hooks.
4. Replace every JSX text node with `t('namespace.key')`; add the keys to `pt-PT/<namespace>.json` and `en/<namespace>.json`.
5. Add `accessibilityRole`, `accessibilityLabel` to every interactive element (Pass-1 a11y baseline).
6. Delete the screen function from `App.tsx`; replace its render branch with `<Redirect href="/welcome" />` until the router can fully take over (Commit 11).

Welcome specifically: the three step cards (App.tsx:1216–1250) become a `FlatList` with `pagingEnabled` (so step navigation is on-rails) and a primary CTA "Começar".

### Commit 5 — Extract **Settings** (`(app)/settings/index.tsx`)

Settings has lots of strings and is mostly leaf nodes — great second target. Splits into four sub-routes (`products`, `stores`, `household`, `account`), but only `index.tsx` is implemented in this commit. The other three are stubs with "Em breve" copy.

Side effect: pulls `settingsStore` into actual use. The `voiceSearchEnabled` toggle now reads/writes the store, not a local state.

### Commit 6 — Extract **List** (`(app)/(tabs)/list.tsx`)

First non-trivial screen. Brings `shoppingListStore` and `productsStore` online. The hidden row-tap-toggles-alternatives behaviour (App.tsx:1523) is **explicitly replaced** with a labelled switch on the row — this is part of the UX-issue-5 fix from the synthesis. Note: this is the first UX *change*, not just a refactor; flag it for Codex.

### Commit 7 — Extract **Add** (`(app)/(tabs)/add.tsx`)

Brings `productsStore` mutation actions online. The "Produto novo" inline form (App.tsx:1712–1750) moves to a dedicated modal route `app/(app)/products/new.tsx`. The card-edit inline form (App.tsx:1757–1819) moves to `app/(app)/products/[productId]/edit.tsx`. Both are presented modally via `expo-router`'s `presentation: 'modal'` option.

### Commit 8 — Extract **Shop** entry + cart (`(app)/(tabs)/shop/index.tsx` and `[storeId]/index.tsx`)

The biggest extraction. **Defer the drag-and-drop and pick-row UX rewrite to W4** — keep the existing Responder-API drag code as-is inside the new file. The goal of this commit is structural only.

`tripStore`, `routesStore`, `storesStore` all come online here. The undo button moves to a `Snackbar` rendered by `SnackbarHost` in the root layout, surfaced via `useUndoToast()` (App.tsx:2034–2040 disappears from the screen; the toast handles it).

The route-editor inline panel (App.tsx:1971–1998) moves to `app/(app)/shop/[storeId]/route-editor.tsx`, modal-presented.

### Commit 9 — Extract **Summary** (`shop/[storeId]/summary.tsx`)

Small screen. Adds the missing V1 actions: rename itinerary, discard training trip, adjust order inline. The confidence display gains a threshold band (≥0.6 green, 0.3–0.6 amber, <0.3 red) — minor UX improvement, low-cost.

### Commit 10 — Build new screens that the monolith never had

The split is now complete for the original six screens. This commit fills the V1 gaps that have no source code to migrate:

- `(app)/(tabs)/home.tsx` — Home as a proper landing screen.
- `shop/[storeId]/missing.tsx` — Missing Products screen.
- `(auth)/sign-in.tsx`, `create-household.tsx`, `join-household.tsx` — placeholders if W5 (auth) is not yet in scope; otherwise full implementations.

If W5 isn't ready, sign-in/create-household are stubbed and `(app)` routes assume a single local household. This is acceptable; the V1 spec already allows local-first usage.

### Commit 11 — Delete `App.tsx`

The monolith is now empty (or down to a few utility functions). Move any remaining helpers to `src/domain/listLifecycle.ts` (`buildNextShoppingList`, `normalizeExistingProduct`, etc.). Delete `App.tsx`. Flip `app/index.tsx` from a re-export to the actual redirector logic (auth check → `/(auth)/welcome` or `/(app)/home`).

`npm run i18n:check` is upgraded from warning to error.

---

## 4. What stays out of scope of this plan

The following are deliberately not in W1+W2 and should not slip in during this work:

- **Shopping Mode UX rewrite (W4)** — the drag-and-drop, haptics, section dividers, swipe actions. Codex must not "fix" this during Commit 8; the structural move is the *only* goal of that commit. Pre-empting W4 inside W1 explodes the diff and breaks the green-on-every-commit discipline.
- **Visual / Pass 2** — colours, icons, dark mode, motion. Tokens are scaffolded in `src/ui/tokens.ts` but their *values* stay equivalent to the current hard-coded hexes (App.tsx:3453+).
- **RLS, account deletion, auth UI (W5)** — placeholders are fine; full implementation is its own workstream.
- **Telemetry (Sentry/PostHog)** — separate workstream.
- **The 11-sections-vs-10-section-card-styles mismatch** (sampleData.ts vs App.tsx:3395–3450) — fixed only as a one-line bonus during Commit 6, not chased into a refactor.

---

## 5. Definition of done for Pass 1 W1+W2

1. `App.tsx` no longer exists.
2. Every user-facing string is in `src/i18n/locales/<locale>/<namespace>.json`. `npm run i18n:check` passes with zero warnings.
3. The seven `src/state/*Store.ts` files own all app-wide state. No screen file declares `useState` for app-wide data (only for local UI: search input focus, modal open/closed, etc.).
4. `expo-router` resolves all routes; the V1 ten-screen map has a file path for every screen (some still stubs).
5. Every interactive element has an `accessibilityRole` and an `accessibilityLabel` keyed to i18n.
6. `npm run typecheck`, `npm run i18n:check`, and a manual smoke test of the six original flows (welcome → add → list → shop → checkout → summary → settings) all pass on iOS, Android, and web.
7. The persisted state from before the migration is read intact on first launch after migration — no household loses their list.

---

## 6. Risks and where to slow down

- **Persistence hydration race** in Commit 2. The legacy import must run *before* any store consumer mounts; otherwise stores hydrate with defaults and overwrite the legacy blob. The fix is a synchronous import in `app/_layout.tsx` before children render — verify with a fresh install carrying a real `STORAGE_KEY` blob from the staging build.
- **Web bundler regressions**. `expo-router` + `react-native-web` 0.21 sometimes needs `metro.config.js` adjustments. Test Commit 1 on web first; don't proceed to Commit 2 with a broken web build.
- **Translation drift between locales**. Establish that `en` is the source of truth and `pt-PT` is co-edited by Pedro. Other locales are generated by translator pass after Pass 1 closes.
- **Codex over-refactoring**. Each commit should be small. If Codex bundles two screen extractions into one commit, reject the diff. The cadence is the point.

---

## 7. Suggested cadence

Eleven commits, one per working session, is achievable in two to three weeks at a sustainable pace, assuming Codex handles the mechanical work and Pedro reviews each commit. If Pedro wants to start sooner, commits 1–3 are the safest place to begin because they're additive and reversible.

Once W1+W2 land, the rest of Pass 1 (W3 accessibility AA, W4 Shopping Mode rewrite, W5 missing screens, W6 token consolidation) becomes parallelizable across Codex sessions because the file boundaries finally support it.

---

## 8. Execution Log

### 2026-05-17 21:28 Europe/Lisbon - Codex

Status: Commit 1 and Commit 2 scaffolding have been started and validated locally. The app remains functional through the existing `App.tsx` monolith.

Completed:

- Installed Pass 1 infrastructure dependencies with the repo's current npm workflow:
  - `expo-router`
  - `react-native-screens`
  - `react-native-safe-area-context`
  - `expo-localization`
  - `zustand`
  - `immer`
  - `i18next`
  - `react-i18next`
- Changed `package.json` `main` from `expo/AppEntry` to `expo-router/entry`.
- Added the initial router shell:
  - `app/_layout.tsx`
  - `app/index.tsx`
- Kept `App.tsx` as the active application surface by re-exporting it through the router index route.
- Added the first pass of state scaffolding under `src/state/`:
  - `types.ts`
  - `persistence.ts`
  - `productsStore.ts`
  - `shoppingListStore.ts`
  - `storesStore.ts`
  - `routesStore.ts`
  - `tripStore.ts`
  - `settingsStore.ts`
  - `syncStore.ts`
  - `authStore.ts`
- Added legacy storage helpers that preserve the existing storage keys and read the current `smart-shoppingcart:v1` blob.

Validation:

- `npm run typecheck` passed.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed with `expo-router/entry`.
- Browser smoke test on `http://127.0.0.1:8083/` passed:
  - app title rendered
  - core navigation rendered
  - no console errors observed
- Temporary `dist-router-smoke` export folder was deleted after validation.

Flags / Roadblocks:

- The plan references `pnpm`, but the project currently uses `npm` and `package-lock.json`. Continue with `npm` unless the project intentionally migrates package managers.
- `expo-router`, `expo-localization`, `react-native-screens`, and `react-native-safe-area-context` include native/runtime implications. This migration will require a new EAS build for family phone testing; it is not safe to treat as OTA-only.
- The i18n plan sets `en` as the default source locale. The current app UX and household testing are pt-PT-first. I did not change runtime language behavior during this infrastructure pass.
- The persistence hydration race remains the main risk for Commit 2 becoming live. Stores are scaffolded but not consumed yet. Before any screen reads from zustand stores, add a synchronous bootstrap/import guard in the router layout so legacy state cannot be overwritten by defaults.
- The state stores currently duplicate some constants from `App.tsx` while the monolith still owns runtime state. This is intentional for a green transitional step, but it should be consolidated once screens migrate.

Next recommended step:

- Execute Commit 3: scaffold i18n catalogue and wrap `app/_layout.tsx` with `I18nextProvider`, still with no screen extraction and no user-facing copy changes.

Signed-off-by: Codex <codex@openai.com>
