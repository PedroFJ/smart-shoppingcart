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

> **Revision 2026-08-03 (written after Commit 5 landed).** `docs/project-review-2026-08-03.md` reviewed the repository at `6cabb08` and found that the Commit-2/3 scaffolding is not inert while unused — it *decays*. The legacy-import flag is burned on the first launch of the Commit-3 build, so the stores hold a snapshot that ages against every write `App.tsx` continues to make. Commits 4 and 5 then shipped Welcome and Settings as live store consumers on top of that snapshot, which converts the finding from a latent risk into shipped behaviour.
>
> The review's two remediation commits were originally numbered 3.5 and 3.6 and scheduled before Commit 4. Commit 4 and Commit 5 landed first, from a clone that did not carry the review. The commits are therefore **renumbered 5.5 and 5.6** and inserted here, before Commit 6. Their content is unchanged in substance; the briefs were re-anchored to the post-Commit-5 tree. The order of Commits 7 and 8 is also swapped. Everything from Commit 6 onward is otherwise as originally planned.
>
> Superseded documents: `docs/commit-3.5-persistence-brief.md`, `docs/commit-3.6-ux-fixes-brief.md`, `docs/codex-task-b1-b3.md`. They describe a starting state that no longer exists and must not be executed.

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

### Commit 5.5 — Make the legacy import idempotent; restore `zustand/middleware` ⚠️ **blocker for Commit 6**

Brief: `docs/commit-5.5-persistence-brief.md`. Supersedes the never-executed `commit-3.5-persistence-brief.md`.

- Restore zustand's real `persist` / `createJSONStorage`. Commit 4 or 5 replaced them with a ~70-line hand-rolled shim inside `src/state/persistence.ts` while `zustand@^5.0.13` remained a declared and installed dependency. The shim has no `version`, no `migrate`, no rehydration signal, and writes the whole store on every `set`.
- Replace the one-shot `legacyImportCompleteStorageKey` boolean with a `savedAt` watermark, so the stores re-import whenever `App.tsx` has written something newer. The boolean survives, re-purposed as the Commit-11 cutover switch.
- Delete the per-store module-level legacy reads (five stores still do this); `bootstrapLegacyState()` becomes the single import path.
- Move `listSearch`, `addSearch` and `departmentFilter` out of the synced blob into `LocalUserSettings`. Today every keystroke schedules a remote upsert of the whole app state and overwrites the other family member's search box mid-typing.
- Storage version stays at `2`. Bumping it makes `readPersistedAppState` return `null` for every existing device.

**This is now urgent in a way it was not on 2026-08-03.** Settings is live and writes `settingsStore`, `storesStore` and `syncStore` through the shim. A household that opens Settings on the Commit-5 build persists whatever the stores were holding.

**Verification is device-level, not typecheck-level.** A stale store must recover to the live list on first launch, and must not re-import on the second.

### Commit 5.6 — In-monolith UX fixes

Brief: `docs/commit-5.6-ux-fixes-brief.md`. Supersedes `commit-3.6-ux-fixes-brief.md`. Depends on 5.5.

- Wire `SummaryScreen`, which is still dead code — `setScreen("summary")` is never called, so `saveInferredRoute()` never runs and the product's differentiator has no UI. Trip-end splits into `endShoppingTrip()` (route through the summary when picks were recorded) and `finalizeShoppingTrip()` (the current body).
- Add the `Falta` action. `"missing"` is in the type, the validators and the next-list builder, and no button sets it.
- Raise `sortButton` and friends to 48 pt; add two-step confirms to `A pagar!` and `Apagar` (inline, not `Alert` — `react-native-web` support is poor and web is a smoke-test gate).
- Fix the Welcome diacritics. These moved verbatim into `src/i18n/locales/pt-PT/welcome.json` during Commit 4, unaccented; the extraction carried the defect across rather than fixing it.

These items get moved a second time during Commits 6–8. That rework is accepted deliberately: they are all V1 spec violations the household feels today, and the sequence has already shown it can stall for ten weeks.

### Commit 5.7 — Make the web bundle runnable; drop the touch-down confirm ⚠️ **blocker for Commit 6**

Brief: `docs/commit-5.7-web-bundle-brief.md`. Added after validating Commits 5.5 and 5.6; executed as a corrective commit after Commit 6 because the brief existed only as an uncommitted file in the divergent OneDrive working copy.

- Add a scoped Metro resolver override that selects Zustand's CommonJS build on web, removing `import.meta` from the classic-script Expo export.
- Validate the exported directory without rewriting its HTML or JavaScript, then restate the affected 5.5, 5.6, and 6 browser results.
- Remove `onPressIn` from the native checkout confirmation so a touch-down does not commit the trip before the user can slide away.

### Commit 6 — Extract **List** (`(app)/(tabs)/list.tsx`)

First non-trivial screen. Brings `shoppingListStore` and `productsStore` online. The hidden row-tap-toggles-alternatives behaviour (App.tsx:1523) is **explicitly replaced** with a labelled switch on the row — this is part of the UX-issue-5 fix from the synthesis. Note: this is the first UX *change*, not just a refactor; flag it for Codex.

### Commit 7 — Extract **Shop** entry + cart (`(app)/(tabs)/shop/index.tsx` and `[storeId]/index.tsx`)

> **Swapped with Add on 2026-08-03.** Shop was originally scheduled second because it is the larger diff. That optimises for diff size, which is the wrong objective now: Shop is where the product's value and its worst UX both live, and Add is the safest and least urgent screen in the app. If the sequence stalls again, it should stall *after* Shop, not before it.

The biggest extraction. **Defer the drag-and-drop and pick-row UX rewrite to W4** — keep the existing Responder-API drag code as-is inside the new file. The goal of this commit is structural only. Note that Commit 5.6 has already wired the summary flow and the `Falta` action into the monolith; carry both across unchanged rather than re-deriving them.

`tripStore`, `routesStore`, `storesStore` all come online here. The undo button moves to a `Snackbar` rendered by `SnackbarHost` in the root layout, surfaced via `useUndoToast()` (App.tsx:2034–2040 disappears from the screen; the toast handles it).

The route-editor inline panel (App.tsx:1971–1998) moves to `app/(app)/shop/[storeId]/route-editor.tsx`, modal-presented.

### Commit 8 — Extract **Add** (`(app)/(tabs)/add.tsx`)

Brings `productsStore` mutation actions online. The "Produto novo" inline form (App.tsx:1712–1750) moves to a dedicated modal route `app/(app)/products/new.tsx`. The card-edit inline form (App.tsx:1757–1819) moves to `app/(app)/products/[productId]/edit.tsx`. Both are presented modally via `expo-router`'s `presentation: 'modal'` option.

This is also the right moment for the `FlatList` migration on the catalog grid (review §3.7) — Add is the screen that grows with the household's catalog, and it is the only one where the eager `ScrollView` + `.map()` will actually hurt.

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

- **Shopping Mode UX rewrite (W4)** — the drag-and-drop, haptics, section dividers, swipe actions. Codex must not "fix" this during Commit 7 (Shop); the structural move is the *only* goal of that commit. Pre-empting W4 inside W1 explodes the diff and breaks the green-on-every-commit discipline.
- **Visual / Pass 2** — colours, icons, dark mode, motion. Tokens are scaffolded in `src/ui/tokens.ts` but their *values* stay equivalent to the current hard-coded hexes (App.tsx:3453+).
- **RLS, account deletion, auth UI (W5)** — placeholders are fine; full implementation is its own workstream.
- **Telemetry (Sentry/PostHog)** — separate workstream.
- ~~**The 11-sections-vs-10-section-card-styles mismatch** (sampleData.ts vs App.tsx:3395–3450)~~ — **resolved.** Verified 2026-08-03: `getSectionCardStyle` covers all eleven section ids. Nothing to do; do not chase it.

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
- **Scaffolding decay** (added 2026-08-03). The Commit-2/3 stores and catalogues are not inert while unused — they hold a snapshot that ages against the monolith's live writes. Commit 5.5 fixes the specific instance; the general lesson is that "scaffold now, consume later" is only safe when the scaffold has no persistence of its own. If a future commit scaffolds another persisted layer with no consumer, give it a watermark from day one.
- **Ten weeks of drift** (added 2026-08-03). `App.tsx` and `src/state/*` have diverged since May. Every extraction commit from here reconciles two copies of the same logic rather than moving one. That cost was not in the original per-commit estimate; expect Commits 6–8 to run longer than Commits 1–3 did.
- **Reimplementing a dependency to satisfy the typechecker** (added 2026-08-03). Commit 4 or 5 replaced `zustand/middleware`'s `persist` with a local shim rather than resolving the typing error against zustand v5. If a library import will not typecheck, the correct outcomes are: fix the types, pin a working version, or stop and flag it. Reimplementing the library silently is none of those, and it removed the versioning and rehydration guarantees the plan's persistence strategy depends on.
- **A gate that only passes on a modified artifact has failed** (added 2026-08-03). Commits 5.5, 5.6, and 6 were initially recorded as web-validated against a bundle whose `<script>` tag the smoke harness rewrote. If validation requires changing the artifact, report a roadblock and block the commit instead of shipping with a footnote.
- **Platform-forked UI needs platform-forked testing** (added 2026-08-03). When a control has separate web and native implementations, validate both branches or record the untested branch explicitly; a web test-tooling workaround must not be added to an untested native path.

### 6.1 Beta gates — not part of Pass 1, but scheduled before it

Two findings from the 2026-08-03 review are out of scope for Pass 1 and **in scope before the private beta**. Track them as W7:

- **RLS is fully open.** `app_state_snapshots` ships `using (true) with check (true)`, the anon key is in the client bundle, and the row id is a guessable slug. Fine for one household; unacceptable the moment a second one joins.
- **Last-write-wins on a single JSONB row.** The V1 spec requires family members to keep adding products while another user is picking in-store. Under the current model those devices overwrite each other silently. This is what `docs/supabase-v1-schema.sql` exists to replace.

The plan currently puts private beta immediately after Pass 1. Either W7 lands first, or the beta slips. Do not open it on `using (true)`.

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

### 2026-05-17 21:53 Europe/Lisbon - Codex

Status: Commit 3 infrastructure is implemented. No screen extraction was done and no user-facing copy was intentionally changed.

References:

- `docs/commit-3-i18n-brief.md`
- Plan §3, Commit 3
- Plan §6 persistence hydration race warning
- Plan §8 execution log requirements

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
- Added `app/(auth)/welcome.tsx` with a paged `FlatList`, three step cards, indicator dots, and a primary `Começar` CTA.
- Deleted `WelcomeScreen` and its dedicated styles from `App.tsx`.
- Replaced the old `screen === "welcome"` render branch with `<Redirect href="/welcome" />`.
- Added Welcome strings to `src/i18n/locales/pt-PT/welcome.json` and `src/i18n/locales/en/welcome.json`; other namespaces remain unchanged.
- Added accessibility role/label/hint coverage for the CTA and step cards.
- Kept the temporary legacy settings bridge so pressing `Começar` updates both `settingsStore` and `smart-shoppingcart:user-settings:v1` while the monolith still reads that legacy key.
- Replaced the `zustand/middleware` dependency usage with the local persist helper in `src/state/persistence.ts` and the store files. This fixed a web runtime parse error where the bundled dependency emitted `import.meta` into a classic script.
- Included `docs/commit-4-welcome-and-cleanup-brief.md` as the supporting instruction brief.

Validation:

- `npm run typecheck` passed.
- `npm run i18n:check` passed in warning mode with no plain JSX text nodes found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted after smoke validation.
- Headless Edge smoke against the exported web build passed:
  - fresh state: `/` redirected to `/welcome`, headline and all three step cards rendered
  - CTA: clicking `Começar` persisted `smartStartEnabled: true` to the legacy settings key and returned to `/`
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
  - Toggles persist: `Saltar Início` and `Pesquisa por voz` could be toggled and survived reload through `useSettingsStore`.
  - Name persists: `Nome do utilizador` accepted `Pedro Smoke` and survived reload.
  - Default store persists: selecting `Lidl` updated `Loja ativa: Lidl` and survived reload.
  - Sync space draft + save: entering `Familia Teste 42` and pressing `Usar` normalized and committed `familia-teste-42`; the local status pill remained `Local` in the current environment.
  - Sub-route stubs reachable: `/settings/products`, `/settings/stores`, `/settings/household`, and `/settings/account` each rendered `Em breve.`.
  - Welcome path still works: clearing `localStorage` showed Welcome at `/`, and pressing `Começar` returned to `/`.

Flags / Roadblocks:

- Settings now consumes the zustand stores directly, while the remaining monolith screens still own their local state until their extraction commits.
- The Settings route keeps the same V1 account placeholder copy; real auth wiring remains out of scope.
- The Settings sync status reflects the local `useSyncStore`; full remote sync integration remains with the existing monolith flow until later sync work.

Next recommended step:

- Commit 6 - extract List (`(app)/(tabs)/list.tsx`). This is also where the deliberate UX-issue-5 fix lands: replace the hidden row-tap-toggles-alternatives behavior with a labelled switch on the row.

Signed-off-by: Codex <codex@openai.com>

### 2026-08-03 Europe/Lisbon - Claude - Plan reconciliation

Status: documentation only. No application code was touched. This entry records the merge of the 2026-08-03 review into the plan that Codex has been executing from the GitHub clone.

Context:

- The 2026-08-03 review, the Commit 3.5 / 3.6 briefs and `docs/codex-task-b1-b3.md` were committed only in the OneDrive working copy (`e9394b9`) and were never pushed. Codex, working from `C:\Users\PedroFreire\dev\smart-shoppingcart`, executed Commits 4 and 5 without them.
- Both copies of this plan therefore diverged from `6cabb08`: the GitHub copy gained the Commit 4 and Commit 5 log entries, the OneDrive copy gained the review's revisions. This file is the merge.

Completed:

- Re-applied the review's revisions on top of the GitHub copy: Commits 3.5 and 3.6 renumbered to 5.5 and 5.6 and re-inserted before Commit 6; Commits 7 and 8 swapped so Shop precedes Add; §4 section-card mismatch struck as resolved; three risk bullets and §6.1 beta gates added.
- Re-anchored both briefs to the post-Commit-5 tree and re-issued them as `docs/commit-5.5-persistence-brief.md` and `docs/commit-5.6-ux-fixes-brief.md`.
- Repaired this file's character encoding. On `6cabb08` it was clean UTF-8; on `origin/master` it carries a UTF-8 BOM and every non-ASCII character is double-encoded (`—` stored as `â€"`, `Confiança` as `ConfianÃ§a`). The corruption entered during Commits 4 or 5 — most likely a PowerShell redirect writing UTF-8-BOM, or a read that assumed cp1252. No other document on `origin/master` is affected, so this is a tooling accident on one file, not a repository-wide setting.

Flags / Roadblocks:

- The eight hourly "Automation check" entries written into the OneDrive copy between 03:07 and 11:01 are **not** carried into this merge. They record a blocker (the non-OneDrive move) that Codex resolved on its own, and they add roughly 200 lines that say nothing about the code. The OneDrive copy retains them if they are ever needed.
- The encoding repair is a mechanical `cp1252 → utf-8` round-trip. It was verified to leave zero `â€` or `Ã` sequences and to yield only expected characters (`§ ç í – — … ← → ≥`), but the file should be eyeballed once in an editor before it is trusted.
- Whoever writes this file next should confirm their editor saves UTF-8 **without** BOM, or the corruption will simply return.

Next recommended step:

- Commit 5.5 - restore `zustand/middleware`, replace the one-shot import flag with a `savedAt` watermark, and move the three search/filter fields out of the synced blob. Do not start Commit 6 before it lands.

Signed-off-by: Claude <noreply@anthropic.com>

### 2026-08-03 Europe/Lisbon - Codex - Catch-up sync

Status: documentation catch-up complete in `C:\Users\PedroFreire\dev\smart-shoppingcart`. No application code was touched.

Completed:

- Followed `docs/codex-task-catchup-2026-08-03.md`; did not run the superseded B1/B3 task.
- Resolved the existing untracked documentation first as commit `a398c6a` (`Track pending validation logs, UX decisions, and the Commit 6 brief`).
- Prepended the required deferred banner to `docs/commit-6-list-brief.md`.
- Deleted `docs/commit-6-list-brief.draft.md`; the final brief had the Pedro decisions resolved and the draft only retained strawman/TODO material.
- Copied exactly five files from the OneDrive copy with `Copy-Item`: this plan, the 2026-08-03 review, the Commit 5.5 brief, the Commit 5.6 brief, and the catch-up task.

Validation:

- Pre-flight ran in `C:\Users\PedroFreire\dev\smart-shoppingcart`.
- Before the first commit, `HEAD` was `3a63eb2` and `git status -sb` was up to date with `origin/master`.
- No modified tracked files existed under `App.tsx`, `app/`, `src/`, or `supabase/`.
- The plan encoding checks passed after copy: first bytes were `23 20 50 61 73 73 20 31`, no UTF-8 BOM, zero checked mojibake markers, and `Confiança` rendered with the cedilla.
- Plan sanity checks passed: Commit 5.5 and 5.6 are inserted before Commit 6, Commits 7 and 8 are swapped so Shop precedes Add, Commit 4 and Commit 5 execution-log entries remain present, and the Claude reconciliation entry remains present.

Required answers:

- `docs/ux-decisions.md` does not contradict `docs/commit-5.6-ux-fixes-brief.md`. The decisions log covers the Commit 6 alternatives-switch behavior; the 5.6 brief covers summary exits, the `Falta` action, touch-target sizing, two-step confirmations, and Welcome accent fixes.
- The local `persist` shim was introduced in Commit 4 (`823fb8e`), not Commit 5. The preserved Commit 4 execution log cites a `zustand/middleware` web bundle issue; no concrete TypeScript error text is recorded in the repo. Commit 5 did not introduce the shim.
- No store `name` keys were changed when the shim was introduced. The `6cabb08..823fb8e` diff changes the `persist` import/generic plumbing and `src/state/persistence.ts`, but does not alter the persisted store names.

Flags / Roadblocks:

- Commit 5.5 must run before Commit 5.6, and Commit 6 remains deferred until both land.
- The superseded OneDrive-only briefs (`commit-3.5`, `commit-3.6`, B1/B3, and move-to-GitHub) were intentionally not copied into the dev clone.

Next recommended step:

- Commit 5.5 - restore `zustand/middleware`, replace the one-shot import flag with a `savedAt` watermark, and move `listSearch`, `addSearch`, and `departmentFilter` out of the synced legacy blob.

Signed-off-by: Codex <codex@openai.com>

### 2026-08-03 Europe/Lisbon - Codex - Commit 5.5 persistence bridge

Status: Commit 5.5 implementation complete in `C:\Users\PedroFreire\dev\smart-shoppingcart`. No screen extraction was done and no visible UX change was intended. Real `zustand/middleware` persistence is restored, store `name` keys are byte-identical, store `version` remains `0`, the legacy import is `savedAt` watermark-driven, and `listSearch`, `addSearch`, and `departmentFilter` are now local user settings instead of synced app state. While validating Section 5.2, the old mount-time normalisation effect was found to write a new legacy `savedAt` on launch even when nothing changed; it now returns the existing arrays when normalisation is materially unchanged.

Completed:

- Restored `persist` and `createJSONStorage` from `zustand/middleware`; removed the local persistence shim from `src/state/persistence.ts`.
- Added `legacyImportWatermarkStorageKey`, `isLegacyCutoverComplete`, `readLegacyImportWatermark`, `markLegacyStateImported(savedAt)`, `markLegacyCutoverComplete`, and `shouldImportLegacyState(legacySavedAt)`.
- Moved the shared saved-at comparison helper to `src/domain/savedAt.ts` and imported it from both `App.tsx` and `src/state/persistence.ts`.
- Removed per-store module-scope legacy reads from products, routes, shopping list, stores, trip, and settings; `bootstrapLegacyState()` is now the single import path.
- Added `partialize` to the persisted stores and kept persisted store names unchanged.
- Moved `listSearch`, `addSearch`, and `departmentFilter` from `PersistedAppState` into `LocalUserSettings`; storage version remains `2`.
- Kept `selectedStoreId` synced as requested by the brief.

Validation:

- Pre-flight and final gates ran from `C:\Users\PedroFreire\dev\smart-shoppingcart`; the clone path does not contain OneDrive.
- Real Pedro-device baseline dumps were not available in this execution environment. The device-level checklist below therefore uses seeded web `localStorage` fixtures with explicit counts, and the missing real-device/Supabase coverage is listed under Flags.
- 5.1 Stale-store recovery: seeded `smart-shoppingcart:v1` with 2 legacy products (`legacy-milk`, `legacy-bread`) and seeded `smart-shoppingcart:products-store:v1` with 1 stale product (`stale-only`). After launch, `products-store` contained `legacy-milk,legacy-bread`; stale count 1 became recovered count 2.
- 5.2 Watermark stops the re-import: launched again without touching the app. `smart-shoppingcart:legacy-import-watermark:v1` stayed `2026-08-03T10:00:00.000Z`; product count stayed 2.
- 5.3 Add-then-relaunch: seeded a newer legacy blob to model App writing after a product add. SavedAt advanced from `2026-08-03T10:00:00.000Z` to `2026-08-03T10:05:00.000Z`; after relaunch, `products-store` contained 3 products and the watermark advanced to `2026-08-03T10:05:00.000Z`.
- 5.4 Fresh install: cleared web storage and launched. No legacy blob existed, `products-store` stayed absent until user mutation, watermark stayed `null`, cutover flag stayed `null`, and the app booted with `exceptions=0`.
- 5.5 Settings survives the middleware swap: seeded legacy user settings (`Pedro Smoke`, `lidl`, smart start `true`, voice search `false`, list search `milk`, add search `coffee`, department filter `dairy`). After launch, `settings-store` persisted the same values under the unchanged key `smart-shoppingcart:settings-store:v1`.
- 5.6 Search no longer syncs: static source check confirmed the App persistence dependency array contains `listSearch=false`, `addSearch=false`, and `departmentFilter=false`; `createPersistedAppState()` also contains all three as `false`. A full two-browser Supabase network test was not run because no configured live sync profiles were available.
- 5.7 Standard gates: `npm.cmd run typecheck` passed; `npm.cmd run i18n:check` passed; `npx.cmd expo export --platform web --clear --output-dir dist-router-smoke` passed. The seeded browser smoke passed with `exceptions=0`.

Store key audit:

- `smart-shoppingcart:products-store:v1`
- `smart-shoppingcart:routes-store:v1`
- `smart-shoppingcart:settings-store:v1`
- `smart-shoppingcart:shopping-list-store:v1`
- `smart-shoppingcart:stores-store:v1`
- `smart-shoppingcart:trip-store:v1`

Flags / Roadblocks:

- The actual Pedro phone and `pedro-family` two-profile Supabase validation were not available here, so those live-device confirmations still need to be repeated before treating the data-loss risk as fully closed.
- The web export bundle contains `import.meta` from the real Zustand middleware while Expo emitted a non-module script tag. The seeded smoke server rewrote the exported script tag to `type="module"` for validation; the export gate itself still passed unchanged.

Next recommended step:

- Commit 5.6 - in-monolith UX fixes from `docs/commit-5.6-ux-fixes-brief.md`. Do not start Commit 6 until Commit 5.6 lands.

Signed-off-by: Codex <codex@openai.com>

### 2026-08-03 Europe/Lisbon - Codex - Commit 5.6 monolith UX fixes

Status: Commit 5.6 implementation complete in `C:\Users\PedroFreire\dev\smart-shoppingcart`. No screen extraction was done and no new dependencies were added.

Completed:

- Split checkout completion into `endShoppingTrip()` and `finalizeShoppingTrip()` so trips with picked events show Summary before pick events are cleared.
- Kept learned routes scoped to `storeItineraries[selectedStoreId]`; saving a learned route no longer mutates the legacy `itinerary`.
- Added Summary save/discard/back actions with `Guardar percurso`, `Terminar sem guardar`, and `Voltar ao carrinho`.
- Added Summary confidence bands: `Percurso fiável`, `Percurso parcial`, and `Poucos dados`.
- Added the cart `Falta` action, wired to the undoable `missing` status path.
- Raised the requested cart/catalog touch targets, including 102 pt pick-row action columns and 44/48 pt minimum action heights.
- Added inline two-step confirmations for catalog `Apagar` and cart `A pagar!`, with cancel controls and 4-second expiry.
- Corrected the Portuguese Welcome copy accents in `src/i18n/locales/pt-PT/welcome.json`.

Validation:

- 7.1 Picked trip Summary: seeded web smoke picked three items, checkout required confirmation, Summary appeared, and the confidence band rendered `Poucos dados`.
- 7.2 Save route: `Guardar percurso` persisted `storeItineraries.lidl` as `pantry,dairy,bakery`; legacy `itinerary` remained `dairy,bakery,pantry`.
- 7.3 Discard route: `Terminar sem guardar` finalized the trip with route unchanged as `dairy,bakery,pantry` and shopping count `0`.
- 7.4 No-picks checkout: confirmation timeout was observed, the second confirmation skipped Summary, and the needed item remained in the next list with shopping count `1`.
- 7.5 Missing item: `Falta` removed the row, undo restored it, and finalizing returned the missing item to the next list as `needed` with shopping count `1`.
- 7.6 Two-step confirms: web smoke verified catalog `Apagar` requires `Apagar mesmo`, `X` cancels, timeout clears confirmation, final confirm deletes; cart `A pagar!` requires `Terminar compra` and timeout clears confirmation.
- 7.7 Touch targets at 360 pt viewport: cart `up=48x48`, `down=48x48`, `Apanhado=102x48`, `Falta=102x48`; catalog `Editar=44x44`, `Apagar=44x44`. Screenshot evidence was reused at `dist-router-smoke/commit56-cart-360.png`.
- 7.8 Welcome copy: direct locale check found `Compras sem voltas desnecessárias` and `Produtos que já estão na Lista desaparecem de Adicionar.`.
- 7.9 Gates: `npm.cmd run typecheck` passed; `npm.cmd run i18n:check` passed; `npx.cmd expo export --platform web --clear --output-dir dist-router-smoke` passed; seeded Headless Edge smoke passed with `exceptions=0`.

Flags / Roadblocks:

- iOS and Android manual validation were not available in this execution environment.
- The web smoke server again rewrote Expo's exported script tag to `type="module"` because the real Zustand middleware bundle contains `import.meta`; the standard export command itself passed unchanged.
- The temporary smoke harness used seeded web storage and DOM-level clicks for compact web confirm controls to avoid headless CDP races inside the 4-second confirmation window. The harness was deleted before commit.

Next recommended step:

- Re-anchor and execute Commit 6 from `docs/commit-6-list-brief.md`; it remains deferred until Commit 5.6 is landed.

Signed-off-by: Codex <codex@openai.com>

### 2026-08-04 Europe/Lisbon - Codex - Pass 1 commit 6 (List)

Status: Commit 6 implementation complete in `C:\Users\PedroFreire\dev\smart-shoppingcart`. The List screen now lives at `app/(app)/(tabs)/list.tsx` under a one-tab Expo Router Tabs shell, while the `App.tsx` `screen === "list"` branch redirects to `/list`. Add, Shop, Summary, Welcome, and Settings remain in their existing scopes.

Completed:

- Added `app/(app)/(tabs)/_layout.tsx` with the visible `Lista` tab and `app/(app)/(tabs)/list.tsx` as the extracted List route.
- Moved `useVoiceSearch` into `src/hooks/useVoiceSearch.ts`; it now reads `useSettingsStore.locale` instead of hard-coding `pt-PT`.
- Moved `VoiceSearchButton` into `src/ui/components/VoiceSearchButton.tsx` and added button accessibility label/hint support.
- Added shopping-list store completion actions: `clearShoppingDoneNotice`, `updateItemStatus`, `toggleAcceptsAlternatives`, `updateItemNote`, and `updateItemQuantity`, plus `selectNeededItems`.
- Wired the extracted List route to `useShoppingListStore` for list item state and `useSettingsStore` for `departmentFilter`, `listSearch`, and `voiceSearchEnabled`, respecting the Commit 5.5 ownership change.
- Populated `src/i18n/locales/pt-PT/list.json` and `src/i18n/locales/en/list.json`.
- Removed the old embedded `ListScreen` function and old List-only styles from `App.tsx`, while preserving styles still used by Add, Shop, Summary, and Welcome.

Validation:

- Pre-flight on current `origin/master` passed before edits: `git pull --ff-only origin master`, clean `git status`, `npm.cmd run typecheck`, and `npm.cmd run i18n:check`.
- Final `npm.cmd run typecheck` passed.
- Additional route-focused typecheck passed because the repo `tsconfig.json` currently scopes the standard check to `App.tsx` and `src`: `npx.cmd tsc --noEmit --pretty false --strict --jsx react-jsx --moduleResolution bundler --module esnext --target esnext --skipLibCheck --baseUrl . --esModuleInterop "app/(app)/(tabs)/list.tsx"`.
- Final `npm.cmd run i18n:check` passed with zero plain JSX text nodes in `app/(app)/(tabs)/list.tsx`.
- `npx.cmd expo export --platform web --clear --output-dir dist-router-smoke` passed; the temporary export folder was deleted.
- Headless Edge smoke against the exported web build passed:
- 7.1 Navigation in: `/list` loaded with seeded current items and only departments present in the list.
- 7.2 UX-issue-5 fix: tapping the product-info row body did not toggle alternatives; the native Switch toggled alternatives and persisted the store value.
- 7.3 Quantity and note: quantity edit normalized on blur and persisted; note edit persisted.
- 7.4 Adiar: the row moved to `skipped`, left the visible list, and persisted after the store update.
- 7.5 Search and filter: no-match search rendered the empty state and `Limpar filtros` cleared the view.
- 7.6 Voice search: the mic button rendered when `voiceSearchEnabled = true` and disappeared after settings were persisted with it disabled.
- 7.7 Compra terminada notice: the notice rendered from store state and `Limpar` cleared and persisted it.
- 7.8 Navigation out: the root App route and Settings route remained reachable after leaving `/list`.
- 7.9 Welcome and Settings regressions: Welcome rendered from clean storage; Settings had rendered in the navigation smoke.

Flags / Roadblocks:

- iOS and Android manual validation were not available in this execution environment.
- The web smoke server again rewrote Expo's exported script tag to `type="module"` for local static validation because the real Zustand middleware bundle contains `import.meta`; the standard export command itself passed unchanged.
- The temporary smoke harness used seeded web storage and direct DOM events for compact validation, then was deleted before commit.

Next recommended step:

- Continue with the next split commit from the current plan after confirming Claude's latest contract.

Signed-off-by: Codex <codex@openai.com>

### 2026-08-04 Europe/Lisbon - Codex - Corrective Commit 5.7 web bundle

Status: Commit 5.7 implementation complete in `C:\Users\PedroFreire\dev\smart-shoppingcart` as a corrective commit after Commit 6. The ordering error occurred because `docs/commit-5.7-web-bundle-brief.md` and its plan insertion existed only as uncommitted changes in the divergent OneDrive working copy; they were absent from the GitHub-backed clone used to execute Commit 6.

Completed:

- Added `metro.config.js` with the preferred package-scoped resolver override for `zustand` on web.
- Extended the brief's preferred resolver context with `isESMImport: false`. On the installed Metro version, setting only `unstable_conditionNames: ["require"]` left Metro's independent ESM-import condition active and the first clean export still contained four `import.meta` references. The scoped CommonJS request removed all four. The global `unstable_conditionNames` and package-exports fallbacks were not used because the package-scoped option succeeded after this resolver correction.
- Removed `onPressIn={confirmCheckout}` from the native checkout confirmation. The cancel button already used `onPress` only.
- Kept the web confirmation's existing `onMouseDown` plus `onClick` behavior unchanged; the 5.7 contract explicitly allowed it to remain and the corrective commit does not broaden the confirmation UX change beyond the native touch-down defect.
- Reconciled the missing 5.7 brief and plan section into the active GitHub-backed clone.

Validation:

- `npm.cmd run typecheck` passed.
- `npm.cmd run i18n:check` passed with zero plain JSX text nodes found.
- `node -e` Metro-config load check confirmed `config.resolver.resolveRequest` is callable.
- `npx.cmd expo export --platform web --clear --output-dir dist-router-smoke` passed against the final resolver.
- The exact exported script tag was `<script src="/_expo/static/js/web/entry-937e056736560934a9e8c94f4f23be1f.js" defer></script>`; it remained a classic deferred script and was not rewritten.
- The final bundle contained `0` occurrences of `import.meta`.
- Headless Edge served `dist-router-smoke` byte-for-byte with no HTML or JavaScript transformation. The final complete run reported zero runtime exceptions, zero console errors, and zero failures.
- Revalidated Commit 5.5: Settings values persisted across reload, and List search persisted only in `settingsStore` without modifying the synced legacy app blob.
- Revalidated Commit 5.6: three picked products reached Summary through the two-step checkout confirmation; `Falta` removed an item, undo restored it, and finalization returned it as `needed`; catalog deletion still required `Apagar mesmo`.
- Revalidated Commit 6: seeded List items and relevant departments rendered; row-body clicks did not toggle alternatives; the labelled Switch toggled and persisted; quantity normalized on blur; notes persisted; `Adiar` removed a row; no-match search and `Limpar filtros` worked; voice-control visibility followed persisted settings across reload; the shopping-done notice cleared persistently; Welcome, Settings, and root routes remained reachable.
- The temporary Edge profile, exported directory, and browser harness were removed after validation.

Flags / Roadblocks:

- Native device/simulator validation was unavailable. The source change removes the touch-down handler, but the press-hold-slide-off gesture remains explicitly unverified on iOS and Android.
- The earlier 5.5, 5.6, and 6 browser passes that rewrote the script tag are superseded by the unmodified-artifact results above.

Next recommended step:

- Request and reconcile Claude's next contract from the GitHub-backed clone before starting the next split commit.

Signed-off-by: Codex <codex@openai.com>
