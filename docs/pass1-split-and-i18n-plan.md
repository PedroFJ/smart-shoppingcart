# Pass 1 â€” `App.tsx` Split + i18n Foundation Plan

This document is the execution plan for **W1 (split the monolith with `expo-router`)** and **W2 (extract strings to an i18n catalogue)** of the UX/UI Pass 1 work. It targets Codex as the implementer; Claude is the planner.

The plan is deliberately ordered so every commit ships green: at no point does the app stop working. The monolithic `App.tsx` survives, in shrinking form, until the very last commit of the sequence.

---

## 1. Why these two workstreams must move together

Each screen extraction crosses a string boundary. If strings stay inline, the extracted file accumulates pt-PT JSX that someone has to revisit later. If we extract strings *as* we extract screens, the i18n catalogue grows organically and the second pass over each file is avoided. The two workstreams share the same touch surface, so the cost of bundling them is near-zero and the savings are real.

The same logic applies to **lifting state to stores**. The current `App.tsx` keeps ~20 `useState` calls in one component (App.tsx:159â€“211) and passes them as props into the screen functions. After the split, those props can't traverse `expo-router` boundaries cleanly. We need stores in place *before* the first screen is moved out.

---

## 2. Target architecture

### 2.1 File tree

```
app/                                     â† expo-router root
  _layout.tsx                            â† root: providers, fonts, status bar, sync init
  index.tsx                              â† entry redirector (auth? â†’ /(auth)/welcome ; else â†’ /(app)/home)

  (auth)/                                â† unauthenticated stack
    _layout.tsx                          â† stack header config, brand
    welcome.tsx                          â† Welcome / value-prop carousel
    sign-in.tsx                          â† Supabase Auth (email magic-link, Google, Apple)
    create-household.tsx                 â† post-signup household creation
    join-household.tsx                   â† redeem invite code / deeplink

  (app)/                                 â† authenticated app
    _layout.tsx                          â† tab bar (compact-aware), header with sync pill + settings
    (tabs)/
      home.tsx                           â† Home: active household, "Iniciar compra" CTA, next-trip preview
      list.tsx                           â† Shopping List (planning view)
      add.tsx                            â† Add Products
      shop/
        index.tsx                        â† Shop entry: pick store + itinerary, "Treino vs Normal"
        [storeId]/
          _layout.tsx                    â† shopping-mode header (sticky section, undo toast)
          index.tsx                      â† Shopping Mode (cart by store route)
          summary.tsx                    â† Training Summary / post-trip
          missing.tsx                    â† Missing Products review
          route-editor.tsx               â† Route Editor for this store (modal-presented)
    settings/
      index.tsx                          â† Settings root
      products.tsx                       â† Manage products (catalog admin)
      stores.tsx                         â† Manage stores
      household.tsx                      â† Manage members, leave/transfer
      account.tsx                        â† Sign out, delete account, export data
    products/
      new.tsx                            â† New product (modal)
      [productId]/edit.tsx               â† Edit product (modal)

src/
  i18n/
    index.ts                             â† i18next init, language detector, namespace registry
    locales/
      pt-PT/
        common.json                      â† Buttons, statuses, units, shared chrome
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
      en/                                â† Same namespaces, English source-of-truth
      pt-BR/                             â† Light fork of pt-PT (terminology overrides)
      es/                                â† Spanish for launch
  state/
    productsStore.ts                     â† Catalog
    shoppingListStore.ts                 â† Active list, statuses, undo stack
    storesStore.ts                       â† Store profiles, selected store, itineraries
    routesStore.ts                       â† Per-store learned routes, pick events
    tripStore.ts                         â† Active training/normal trip, lock state
    settingsStore.ts                     â† smartStart, voice, default store, family code
    syncStore.ts                         â† Supabase status, realtime channel, last sync
    authStore.ts                         â† (W5) user + household
    persistence.ts                       â† zustand persist middleware bound to deviceStorage
  hooks/
    useVoiceSearch.ts                    â† expo-speech-recognition wrapper, locale-aware
    useSyncSubscription.ts               â† Supabase realtime channel binding
    useCompactLayout.ts                  â† isCompactLayout flag from useWindowDimensions
    useUndoToast.ts                      â† snackbar / toast queue for "Apanhado" undo
    useHaptics.ts                        â† Platform-aware vibration / haptic feedback
  ui/
    tokens.ts                            â† spacing, radius, typography, semantic colours
    theme/
      lightTheme.ts
      darkTheme.ts                       â† (Pass 2, but tokens exposed in Pass 1)
    components/
      AppButton.tsx                      â† primary / secondary / destructive variants
      AppTextInput.tsx
      AppSwitch.tsx
      SectionChip.tsx
      EmptyState.tsx
      SyncPill.tsx
      Snackbar.tsx
      ScreenScaffold.tsx                 â† SafeArea + header + scroll wrapper
  domain/
    routeInference.ts                    â† unchanged
    listLifecycle.ts                     â† (extracted) buildNextShoppingList, normalize, etc.
  data/
    sampleData.ts                        â† unchanged
  lib/
    supabase.ts                          â† unchanged
    deviceStorage.ts / .native.ts        â† unchanged; consumed by state/persistence.ts
```

`App.tsx` ceases to exist at the end. `package.json` `main` flips from `expo/AppEntry` to `expo-router/entry`.

### 2.2 State store inventory

Each store is a zustand store with `persist` middleware bound to `src/lib/deviceStorage`. Stores expose **actions** and **selectors**; screens read with hook-selectors and never destructure the whole store.

| Store | Owns | Currently in App.tsx (lines) |
|---|---|---|
| `productsStore` | `products: Product[]`, CRUD, favourites, normalization | 194, 213 |
| `shoppingListStore` | `shoppingItems`, `lastChange` (undo), `shoppingDoneNotice`, `departmentFilter`, `listSearch`, `addSearch` | 195â€“203 |
| `storesStore` | `supermarketProfiles`, `selectedStoreId`, `storeStopOrders`, `storeProductOrders` | 115â€“122, 185â€“193 |
| `routesStore` | `itinerary`, `storeItineraries`, `pickEvents` | 181â€“184, 198 |
| `tripStore` | `isCheckoutLocked`, `lockedPickingIds`, `activeTripItemIds`, trip type (normal/training) | 204â€“210 |
| `settingsStore` | `userName`, `voiceSearchEnabled`, `defaultStoreId`, `smartStartEnabled`, locale | 81â€“86, 151â€“156, 168 |
| `syncStore` | `syncStatus`, `syncMessage`, `activeSyncSpaceId`, client id, last server `updated_at` | 177â€“180, 161â€“167 |
| `authStore` | (W5 â€” empty for now) user, household, members | â€” |

The four `useRef`-stored mutables (`syncClientId`, `remoteApplyInProgress`, `remoteReady`, `syncTimeout`, App.tsx:161â€“166) move into `syncStore`'s internal closure, not React refs.

### 2.3 Provider tree (root `app/_layout.tsx`)

```
<I18nextProvider>
  <ThemeProvider>                  â† Pass 1 stub: tokens only, Pass 2 fills dark mode
    <SafeAreaProvider>
      <SyncBootstrap>              â† reads syncStore, mounts useSyncSubscription
        <Stack> / <Tabs>           â† expo-router shell
          <SnackbarHost />         â† portal for undo toasts
        </Stack>
      </SyncBootstrap>
    </SafeAreaProvider>
  </ThemeProvider>
</I18nextProvider>
```

Zustand stores don't need providers â€” they're singletons imported directly. The only provider count growth is **i18next + theme + safe-area + snackbar host**. Auth context joins in W5.

### 2.4 i18n contract

- **Library**: `i18next` + `react-i18next` + `expo-localization` for device-locale detection.
- **Source locale**: `en` is the translator-facing source-of-truth namespace.
- **Runtime default locale**: `pt-PT` for the household testing build. `en` remains the fallback if a key is missing.
- **Locale forks**: `pt-BR` is a thin overlay over `pt-PT`, `es` is independent.
- **Namespace per screen**, plus `common`, `errors`. Screens use `useTranslation('list')` and call `t('emptyState.title')`.
- **No string concatenation across `t()` calls** â€” every full sentence is one key. ICU/i18next interpolation for product names, counts, dates.
- **Pluralization**: i18next built-in plural rules. Counts use `{{count}}`.
- **Dates and numbers**: `Intl.DateTimeFormat` / `Intl.NumberFormat` via the current locale; helper in `src/i18n/format.ts`.
- **Voice search locale**: read from `settingsStore.locale`, no longer hard-coded (App.tsx:101).
- **Pseudo-locale `de-pseudo`** that expands strings +35%: not shipped, but exercised in dev to catch overflow before real DE arrives.
- **CI guardrail**: a lint script (`npm run i18n:check`) that flags any new JSX text node not wrapped in `t(...)`.

---

## 3. Migration sequence â€” eleven commits, each shippable

Every commit must:
- Pass `npm run typecheck`.
- Render in Expo Go on iOS + Android + web without runtime errors.
- Leave the user-facing app fully functional (no regressions in flows the user already had).

Commits 1â€“3 set up infrastructure with **zero UX change**. Commits 4â€“10 are screen-by-screen extractions. Commit 11 deletes the monolith.

### Commit 1 â€” Install dependencies, switch entry to `expo-router`

- Add: `expo-router`, `react-native-screens`, `react-native-safe-area-context`, `zustand`, `immer`, `i18next`, `react-i18next`, `expo-localization`.
- Flip `package.json` â†’ `"main": "expo-router/entry"`.
- Create `app/_layout.tsx` that **renders the existing `App` component verbatim** at the root index. The router is alive; the app still looks the same.
- Create `app/index.tsx` that re-exports the current `App.tsx` default export.
- No screen extraction yet. No store creation yet. The router shell exists; routes are placeholders.

**Risk**: Web bundler may need `metro.config.js` tweaks (`unstable_enablePackageExports`); test all three platforms.

### Commit 2 â€” Scaffold state stores (no consumers)

- Create the seven store files in `src/state/` with the full state shape and actions, but **no React component reads from them yet**. The monolith still holds the live values.
- Implement `state/persistence.ts` â€” a zustand storage adapter that calls `getDeviceLocalStorage()` from `src/lib/deviceStorage.ts`, preserving the current storage keys (App.tsx:95â€“98) so persisted data survives the migration.
- Add an "import legacy state" one-shot in each store that reads the existing `STORAGE_KEY` blob and hydrates the new stores. This runs once on first launch after the migration.

**Verification**: launch the app, confirm `STORAGE_KEY` blob is read, confirm each store reports the legacy values via a temporary debug log (removed in Commit 3).

### Commit 3 â€” Scaffold i18n catalogue (still no consumers)

- Create `src/i18n/index.ts` that initialises `i18next` with `en` and `pt-PT` namespaces (empty `.json` files for each screen).
- Wrap `app/_layout.tsx` in `<I18nextProvider>`.
- Add the synchronous legacy-store bootstrap guard in `app/_layout.tsx` before any routed screen can consume stores. This is intentionally early, before Commit 4 extracts Welcome.
- Add the `npm run i18n:check` script (a simple grep-based check that fails when JSX `<Text>â€¦</Text>` literals appear in any file under `app/` or `src/state/`; warnings only at this stage).
- Document the locale-fallback policy in `src/i18n/README.md`.

After commit 3: infrastructure is in place; the monolith still owns every screen. We can now extract one screen at a time.

### Commit 4 â€” Extract **Welcome** (`(auth)/welcome.tsx`)

The simplest screen, no state mutations, no business logic. Used to pressure-test the extraction recipe.

For every screen extraction, the recipe is:
1. Create the new file under `app/`.
2. Copy the screen component out of `App.tsx`.
3. Replace prop access with store selectors and navigation hooks.
4. Replace every JSX text node with `t('namespace.key')`; add the keys to `pt-PT/<namespace>.json` and `en/<namespace>.json`.
5. Add `accessibilityRole`, `accessibilityLabel` to every interactive element (Pass-1 a11y baseline).
6. Delete the screen function from `App.tsx`; replace its render branch with `<Redirect href="/welcome" />` until the router can fully take over (Commit 11).

Welcome specifically: the three step cards (App.tsx:1216â€“1250) become a `FlatList` with `pagingEnabled` (so step navigation is on-rails) and a primary CTA "ComeÃ§ar".

### Commit 5 â€” Extract **Settings** (`(app)/settings/index.tsx`)

Settings has lots of strings and is mostly leaf nodes â€” great second target. Splits into four sub-routes (`products`, `stores`, `household`, `account`), but only `index.tsx` is implemented in this commit. The other three are stubs with "Em breve" copy.

Side effect: pulls `settingsStore` into actual use. The `voiceSearchEnabled` toggle now reads/writes the store, not a local state.

### Commit 6 â€” Extract **List** (`(app)/(tabs)/list.tsx`)

First non-trivial screen. Brings `shoppingListStore` and `productsStore` online. The hidden row-tap-toggles-alternatives behaviour (App.tsx:1523) is **explicitly replaced** with a labelled switch on the row â€” this is part of the UX-issue-5 fix from the synthesis. Note: this is the first UX *change*, not just a refactor; flag it for Codex.

### Commit 7 â€” Extract **Add** (`(app)/(tabs)/add.tsx`)

Brings `productsStore` mutation actions online. The "Produto novo" inline form (App.tsx:1712â€“1750) moves to a dedicated modal route `app/(app)/products/new.tsx`. The card-edit inline form (App.tsx:1757â€“1819) moves to `app/(app)/products/[productId]/edit.tsx`. Both are presented modally via `expo-router`'s `presentation: 'modal'` option.

### Commit 8 â€” Extract **Shop** entry + cart (`(app)/(tabs)/shop/index.tsx` and `[storeId]/index.tsx`)

The biggest extraction. **Defer the drag-and-drop and pick-row UX rewrite to W4** â€” keep the existing Responder-API drag code as-is inside the new file. The goal of this commit is structural only.

`tripStore`, `routesStore`, `storesStore` all come online here. The undo button moves to a `Snackbar` rendered by `SnackbarHost` in the root layout, surfaced via `useUndoToast()` (App.tsx:2034â€“2040 disappears from the screen; the toast handles it).

The route-editor inline panel (App.tsx:1971â€“1998) moves to `app/(app)/shop/[storeId]/route-editor.tsx`, modal-presented.

### Commit 9 â€” Extract **Summary** (`shop/[storeId]/summary.tsx`)

Small screen. Adds the missing V1 actions: rename itinerary, discard training trip, adjust order inline. The confidence display gains a threshold band (â‰¥0.6 green, 0.3â€“0.6 amber, <0.3 red) â€” minor UX improvement, low-cost.

### Commit 10 â€” Build new screens that the monolith never had

The split is now complete for the original six screens. This commit fills the V1 gaps that have no source code to migrate:

- `(app)/(tabs)/home.tsx` â€” Home as a proper landing screen.
- `shop/[storeId]/missing.tsx` â€” Missing Products screen.
- `(auth)/sign-in.tsx`, `create-household.tsx`, `join-household.tsx` â€” placeholders if W5 (auth) is not yet in scope; otherwise full implementations.

If W5 isn't ready, sign-in/create-household are stubbed and `(app)` routes assume a single local household. This is acceptable; the V1 spec already allows local-first usage.

### Commit 11 â€” Delete `App.tsx`

The monolith is now empty (or down to a few utility functions). Move any remaining helpers to `src/domain/listLifecycle.ts` (`buildNextShoppingList`, `normalizeExistingProduct`, etc.). Delete `App.tsx`. Flip `app/index.tsx` from a re-export to the actual redirector logic (auth check â†’ `/(auth)/welcome` or `/(app)/home`).

`npm run i18n:check` is upgraded from warning to error.

---

## 4. What stays out of scope of this plan

The following are deliberately not in W1+W2 and should not slip in during this work:

- **Shopping Mode UX rewrite (W4)** â€” the drag-and-drop, haptics, section dividers, swipe actions. Codex must not "fix" this during Commit 8; the structural move is the *only* goal of that commit. Pre-empting W4 inside W1 explodes the diff and breaks the green-on-every-commit discipline.
- **Visual / Pass 2** â€” colours, icons, dark mode, motion. Tokens are scaffolded in `src/ui/tokens.ts` but their *values* stay equivalent to the current hard-coded hexes (App.tsx:3453+).
- **RLS, account deletion, auth UI (W5)** â€” placeholders are fine; full implementation is its own workstream.
- **Telemetry (Sentry/PostHog)** â€” separate workstream.
- **The 11-sections-vs-10-section-card-styles mismatch** (sampleData.ts vs App.tsx:3395â€“3450) â€” fixed only as a one-line bonus during Commit 6, not chased into a refactor.

---

## 5. Definition of done for Pass 1 W1+W2

1. `App.tsx` no longer exists.
2. Every user-facing string is in `src/i18n/locales/<locale>/<namespace>.json`. `npm run i18n:check` passes with zero warnings.
3. The seven `src/state/*Store.ts` files own all app-wide state. No screen file declares `useState` for app-wide data (only for local UI: search input focus, modal open/closed, etc.).
4. `expo-router` resolves all routes; the V1 ten-screen map has a file path for every screen (some still stubs).
5. Every interactive element has an `accessibilityRole` and an `accessibilityLabel` keyed to i18n.
6. `npm run typecheck`, `npm run i18n:check`, and a manual smoke test of the six original flows (welcome â†’ add â†’ list â†’ shop â†’ checkout â†’ summary â†’ settings) all pass on iOS, Android, and web.
7. The persisted state from before the migration is read intact on first launch after migration â€” no household loses their list.

---

## 6. Risks and where to slow down

- **Persistence hydration race** in Commit 2. The legacy import must run *before* any store consumer mounts; otherwise stores hydrate with defaults and overwrite the legacy blob. The fix is a synchronous import in `app/_layout.tsx` before children render â€” verify with a fresh install carrying a real `STORAGE_KEY` blob from the staging build.
- **Web bundler regressions**. `expo-router` + `react-native-web` 0.21 sometimes needs `metro.config.js` adjustments. Test Commit 1 on web first; don't proceed to Commit 2 with a broken web build.
- **Translation drift between locales**. Establish that `en` is the source of truth and `pt-PT` is co-edited by Pedro. Other locales are generated by translator pass after Pass 1 closes.
- **Codex over-refactoring**. Each commit should be small. If Codex bundles two screen extractions into one commit, reject the diff. The cadence is the point.

---

## 7. Suggested cadence

Eleven commits, one per working session, is achievable in two to three weeks at a sustainable pace, assuming Codex handles the mechanical work and Pedro reviews each commit. If Pedro wants to start sooner, commits 1â€“3 are the safest place to begin because they're additive and reversible.

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


### 2026-05-17 21:53 Europe/Lisbon - Codex

Status: Commit 3 infrastructure is implemented. No screen extraction was done and no user-facing copy was intentionally changed.

References:

- `docs/commit-3-i18n-brief.md`
- Plan Â§3, Commit 3
- Plan Â§6 persistence hydration race warning
- Plan Â§8 execution log requirements

Completed:

- Added the i18n foundation under `src/i18n/`:
  - `index.ts`
  - `format.ts`
  - `README.md`
  - empty `en` and `pt-PT` namespace files for the twelve planned namespaces
  - placeholder `pt-BR` and `es` locale folders
- Set the locale policy in code:
  - `en` remains the source-key namespace for translators
  - `pt-PT` remains the runtime default for household testing
  - `pt-BR` falls back through `pt-PT` then `en`
  - `es` falls back to `en`
- Wrapped the router stack in `I18nextProvider`.
- Added `bootstrapLegacyState()` at module scope in `app/_layout.tsx`, before routed screens render.
- Added per-store `hydrateFromLegacy(...)` actions so the legacy `smart-shoppingcart:v1` blob can be imported once before store consumers mount.
- Added the warning-only `scripts/i18n-check.mjs` guard and wired it as `npm run i18n:check`.

Validation:

- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted after validation.
- Hydration guard smoke test passed with a seeded legacy blob:
  - first bootstrap imported the legacy product, shopping item, search/filter/settings data and wrote the legacy-import marker
  - second bootstrap skipped the import after the marker was present, confirming the guard is idempotent

Warnings:

- Browser visual smoke for Commit 3 could not be completed in the in-app browser because the Browser Use tool rejected the local target under its URL policy. The web export build passed, but this specific visual/no-console browser check remains unverified for this commit.
- The hydration smoke test printed `Supabase environment variables are not configured yet.` This is expected in the current local environment and was not introduced by Commit 3.
- Commit 3 includes `docs/commit-3-i18n-brief.md` as a supporting reference document so future changelog entries can trace the exact instruction set used for this pass.

Next recommended step:

- Commit 4 - extract Welcome (`(auth)/welcome.tsx`). This is the first screen that will actually consume both the i18n catalogue and the zustand stores, so it is the moment the hydration guard becomes live for user-facing runtime behavior.

Signed-off-by: Codex <codex@openai.com>

### 2026-05-17 22:07 Europe/Lisbon - Codex - Working tree recovery

Status: recovery complete on commit `06eb964` (`Pass 1 commit 3: scaffold i18n catalogue and hydration guard`). The tracked working tree is aligned with `HEAD`; only the new recovery brief documentation was left to commit.

Completed:

- Pedro paused OneDrive sync before recovery.
- Pedro confirmed editors/tools with the repo open were closed, except this Codex session.
- Rebuilt the git index by removing `.git/index` and running `git reset --mixed HEAD`.
- Restored tracked working-tree files from `HEAD` with `git checkout -- .`.
- Ran `npm install` for lockfile sanity; it reported the project was already up to date.
- Pedro resumed OneDrive sync after validation.
- Re-ran the key integrity checks after a 30-second OneDrive resume window.

Validation:

- `git status --short` ran without index errors and showed only `docs/working-tree-recovery-brief.md` as untracked before this log update.
- `git log --oneline -5` showed `06eb964` at `HEAD`.
- `app/_layout.tsx` was 376 bytes and ended with the expected closing `</I18nextProvider>` and function braces.
- The Commit 3 execution-log heading `2026-05-17 21:53` was present exactly once.
- `src/i18n/locales/en` contained 12 namespace JSON files.
- `src/i18n/locales/pt-PT` contained 12 namespace JSON files.
- `src/i18n/locales/pt-BR` contained `.gitkeep`.
- `src/i18n/locales/es` contained `.gitkeep`.
- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- After OneDrive sync was resumed and 30 seconds elapsed, `HEAD`, `_layout.tsx`, the Commit 3 log entry, and the i18n namespace counts were still correct.

Flags / Roadblocks:

- Pedro chose Option B: keep the repo in OneDrive for now.
- Before every Codex session, pause OneDrive sync and confirm `git status` is clean.
- After every Codex session, confirm `git status` is clean, resume OneDrive sync, wait about 30 seconds, and re-check `git status`.
- Option B is workable but brittle; moving the repo out of OneDrive remains the safer long-term remediation.

Next recommended step:

- Commit 4 - extract Welcome (`(auth)/welcome.tsx`), conditional on continuing the OneDrive pause/check ritual before editing.

Signed-off-by: Codex <codex@openai.com>

### 2026-05-18 00:16 Europe/Lisbon - Codex - Move to GitHub

Status: pushed the repository to GitHub and resumed work from the new non-OneDrive clone at `C:\Users\PedroFreire\dev\smart-shoppingcart`. The GitHub remote was created manually by Pedro at `https://github.com/PedroFJ/smart-shoppingcart`; the initial pushed history landed at `6cabb08` before this docs-only log entry.

Completed:

- Rebuilt the index in the OneDrive copy with `git reset --mixed HEAD` without restoring the working tree.
- Audited `.gitignore` before the first push.
- Scanned tracked files for secret-shaped strings before the first push.
- Confirmed `eas.json` contains build configuration only, with no secrets.
- Added `origin` pointing to `https://github.com/PedroFJ/smart-shoppingcart`.
- Pushed `master` to GitHub.
- Verified this new clone is running from `C:\Users\PedroFreire\dev\smart-shoppingcart`, outside OneDrive.

Validation:

- Pre-push secret scan found only placeholders and environment variable references:
  - `.env.example`
  - `README.md`
  - `src/lib/supabase.ts`
- `.git` size before push was 4.61 MB, which was reasonable for this history.
- `git push -u origin master` succeeded.
- `git ls-remote --heads origin` showed `master` at `6cabb08`.
- In the new clone, `git status --short` was clean before this docs-only log entry.
- In the new clone, `git log --oneline -3` showed `6cabb08`, `06eb964`, and `398d37f`.
- In the new clone, `origin` fetch and push both point to `https://github.com/PedroFJ/smart-shoppingcart`.
- In the new clone, `app/_layout.tsx` was 390 bytes with Windows line endings, matching the expected full file rather than the earlier truncated 138-byte corruption.

Flags / Roadblocks:

- The new clone resolves the OneDrive corruption risk for future Codex work, provided Codex/Cowork stays pointed at `C:\Users\PedroFreire\dev\smart-shoppingcart`.
- The old OneDrive copy should be archived, not deleted immediately, once the new workspace has been confirmed in Codex/Cowork.
- `.gitignore` should be tightened in a later docs/tooling cleanup to include broader patterns such as `.env.*`, `.expo-shared/`, and `dist*/`; this was deliberately not changed before the first GitHub push because that push needed to preserve `6cabb08` exactly.

Next recommended step:

- Commit 4 - extract Welcome (`(auth)/welcome.tsx`) after confirming the active Codex workspace is the new non-OneDrive path.

Signed-off-by: Codex <codex@openai.com>

### 2026-05-18 00:33 Europe/Lisbon - Codex - Normalize line endings

Status: Phase 1 cleanup complete and pushed as `d37fede` (`Normalize line endings to LF via .gitattributes`).

Completed:

- Added `.gitattributes` with LF normalization for text files and binary exemptions for media/native artifacts.
- Ran `git add --renormalize .`.
- Rewrote tracked text working-tree files mechanically from CRLF to LF so the checkout matched the new policy.
- Confirmed no content changes were staged apart from `.gitattributes`.

Validation:

- `git diff --cached --ignore-cr-at-eol --exit-code -- . ':!.gitattributes'` reported no content diff.
- `app/_layout.tsx` had no CRLF pairs after the rewrite and was 376 bytes.
- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted.

Flags / Roadblocks:

- The expected broad 65-file renormalization did not become a repository content diff; the clone already had LF content in the index. The working tree had CRLF due to Windows checkout behavior, and `.gitattributes` now prevents that drift.

Next recommended step:

- Phase 2 - tighten `.gitignore` patterns.

Signed-off-by: Codex <codex@openai.com>

### 2026-05-18 00:33 Europe/Lisbon - Codex - Tighten .gitignore

Status: Phase 2 cleanup complete. The ignore rules now cover broader Node, Expo, build, native artifact, environment, OS, and editor patterns.

Completed:

- Replaced the minimal `.gitignore` with the expanded pattern set from `docs/commit-4-welcome-and-cleanup-brief.md`.
- Preserved `.env.example` as intentionally trackable while ignoring `.env.*`.

Validation:

- Confirmed no tracked files needed to be untracked as part of this ignore change.
- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted.

Flags / Roadblocks:

- The new Commit 4 brief remains intentionally untracked until the Welcome extraction commit, per the brief.

Next recommended step:

- Phase 3 - Pass 1 commit 4: extract Welcome (`(auth)/welcome.tsx`).

Signed-off-by: Codex <codex@openai.com>

### 2026-05-18 01:03 Europe/Lisbon - Codex - Pass 1 commit 4 (Welcome)

Status: Commit 4 implementation complete. Welcome is now an `expo-router` auth route at `app/(auth)/welcome.tsx`; the monolith redirects the old welcome branch to `/welcome`.

Completed:

- Added `app/(auth)/_layout.tsx`.
- Added `app/(auth)/welcome.tsx` with a paged `FlatList`, three step cards, indicator dots, and a primary `ComeÃ§ar` CTA.
- Deleted `WelcomeScreen` and its dedicated styles from `App.tsx`.
- Replaced the old `screen === "welcome"` render branch with `<Redirect href="/welcome" />`.
- Added Welcome strings to `src/i18n/locales/pt-PT/welcome.json` and `src/i18n/locales/en/welcome.json`; other namespaces remain unchanged.
- Added accessibility role/label/hint coverage for the CTA and step cards.
- Kept the temporary legacy settings bridge so pressing `ComeÃ§ar` updates both `settingsStore` and `smart-shoppingcart:user-settings:v1` while the monolith still reads that legacy key.
- Replaced the `zustand/middleware` dependency usage with the local persist helper in `src/state/persistence.ts` and the store files. This fixed a web runtime parse error where the bundled dependency emitted `import.meta` into a classic script.
- Included `docs/commit-4-welcome-and-cleanup-brief.md` as the supporting instruction brief.

Validation:

- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted after smoke validation.
- Headless Edge smoke against the exported web build passed:
  - fresh state: `/` redirected to `/welcome`, headline and all three step cards rendered
  - CTA: clicking `ComeÃ§ar` persisted `smartStartEnabled: true` to the legacy settings key and returned to `/`
  - returning user: pre-seeded `smartStartEnabled: true` loaded `/` and skipped Welcome
  - reset: setting `smartStartEnabled: false` and clearing the new settings store loaded Welcome again
  - browser runtime exceptions: none

Flags / Roadblocks:

- The Welcome CTA routes back to `/` rather than `/(app)/(tabs)/home` because the Home route does not exist until a later Pass 1 commit.
- The local persist helper is intentionally minimal: it covers the synchronous device/browser storage behavior used by the current stores and avoids the `zustand/middleware` web bundle issue.
- The monolith still owns the main app screens after this commit; Welcome is the first extracted route only.

Next recommended step:

- Commit 5 - extract Settings (`(app)/settings/index.tsx`).

Signed-off-by: Codex <codex@openai.com>

### 2026-05-18 22:33 Europe/Lisbon - Codex - Pass 1 commit 5 (Settings)

Status: Commit 5 implementation complete. Settings is now an `expo-router` app route at `app/(app)/settings/index.tsx`; the monolith redirects the old settings branch to `/settings`.

Completed:

- Added `app/(app)/_layout.tsx` as the minimal app route-group stack.
- Added `app/(app)/settings/_layout.tsx` with the localized Settings header title.
- Added `app/(app)/settings/index.tsx` with the seven existing Settings panels moved out of `App.tsx`.
- Added the four planned stub routes: `products`, `stores`, `household`, and `account`, each rendering the localized "Em breve." placeholder.
- Replaced the old `screen === "settings"` render branch in `App.tsx` with `<Redirect href="/settings" />`.
- Deleted the monolith `SettingsScreen` function and its Settings-only styles from `App.tsx`.
- Populated `src/i18n/locales/pt-PT/settings.json` and `src/i18n/locales/en/settings.json`; other locale namespaces remain unchanged.
- Brought `useSettingsStore`, `useStoresStore`, and `useSyncStore` online as the Settings route's runtime state sources.
- Added `commitSyncSpaceDraft()` to `useSyncStore` so the family-sharing draft is normalized, saved, and reflected in the route state.
- Included `docs/commit-5-settings-brief.md` as the supporting instruction brief.

Validation:

- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted after smoke validation.
- Headless Edge smoke against the exported web build passed:
  - Settings reachable: `/settings` rendered all seven panels.
  - Toggles persist: `Saltar InÃ­cio` and `Pesquisa por voz` could be toggled and survived reload through `useSettingsStore`.
  - Name persists: `Nome do utilizador` accepted `Pedro Smoke` and survived reload.
  - Default store persists: selecting `Lidl` updated `Loja ativa: Lidl` and survived reload.
  - Sync space draft + save: entering `Familia Teste 42` and pressing `Usar` normalized and committed `familia-teste-42`; the local status pill remained `Local` in the current environment.
  - Sub-route stubs reachable: `/settings/products`, `/settings/stores`, `/settings/household`, and `/settings/account` each rendered `Em breve.`.
  - Welcome path still works: clearing `localStorage` showed Welcome at `/`, and pressing `ComeÃ§ar` returned to `/`.

Flags / Roadblocks:

- Settings now consumes the zustand stores directly, while the remaining monolith screens still own their local state until their extraction commits.
- The Settings route keeps the same V1 account placeholder copy; real auth wiring remains out of scope.
- The Settings sync status reflects the local `useSyncStore`; full remote sync integration remains with the existing monolith flow until later sync work.

Next recommended step:

- Commit 6 - extract List (`(app)/(tabs)/list.tsx`). This is also where the deliberate UX-issue-5 fix lands: replace the hidden row-tap-toggles-alternatives behavior with a labelled switch on the row.

Signed-off-by: Codex <codex@openai.com>
