# Commit 5.5 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3 (inserted between Commit 5 and Commit 6).
**Source:** `docs/project-review-2026-08-03.md` §2.1 and §2.3, re-anchored to `origin/master` at `3a63eb2`.
**Supersedes:** `docs/commit-3.5-persistence-brief.md`. That brief assumed `HEAD == 6cabb08` and that no screen consumed the stores yet. Both premises are now false. Delete it rather than reconciling it by hand.

**Goal:** restore zustand's real `persist`, make the legacy→zustand import idempotent, and remove per-device view state from the synced blob. **Zero screen extraction. Zero visible UX change.**

This commit is a **blocker for Commit 6**. Do not extract another screen until it lands.

Ship green: `npm run typecheck` passes, `npm run i18n:check` passes, `npx expo export --platform web` builds, and the app renders on iOS / Android / web with the family's real list intact.

---

## 0. Pre-flight

Run from `C:\Users\PedroFreire\dev\smart-shoppingcart`. The OneDrive copy is an archive from here on; it is six commits behind and must not be built from.

```
pwd                         # must NOT contain OneDrive
git status --short          # must be clean
git log --oneline -1        # 3a63eb2 (Pass 1 commit 5) or later
npm run typecheck           # must pass before starting
```

Before writing any code, **capture a baseline** from a device that carries real data (Pedro's phone, or the web build against the `pedro-family` sync space):

1. Dump `smart-shoppingcart:v1` → save as `baseline-legacy.json` (do not commit).
2. Dump `smart-shoppingcart:products-store:v1` → save as `baseline-store.json`.
3. Record `savedAt` from each.

You will need both to prove §5.

Expect the two to differ by roughly eleven weeks. That difference **is the bug**; it is not a corrupted device.

---

## 1. What changed since this was first written

The original brief was written on 2026-08-03 against `6cabb08`, to run *before* Commit 4. It never reached the clone you work from, and Commits 4 and 5 shipped without it. Three things are different now, and two of them make this commit more urgent, not less.

**1. The stores have live consumers.** `app/(app)/settings/index.tsx` reads and writes `useSettingsStore`, `useStoresStore` and `useSyncStore`. `app/(auth)/welcome.tsx` is live too. The stale-snapshot-written-back-over-live-data path described below is no longer hypothetical: it is reachable by opening Settings on the shipped build.

**2. `zustand/middleware` was replaced with a hand-rolled shim.** At `6cabb08`, `src/state/persistence.ts` opened with:

```ts
import { StateStorage, createJSONStorage } from "zustand/middleware";
```

On `origin/master` that import is gone. In its place the file defines its own `StateStorage`, `PersistStorage`, `createJSONStorage` and a ~40-line `persist` — while `zustand@^5.0.13` is still declared in `package.json` and still installed in `node_modules`. Every store imports `persist` from `./persistence`, not from the library.

This is almost certainly a typing error against zustand v5's mutator-aware `StateCreator` that got "fixed" by writing around the library. §2 undoes it. If it turns out the real middleware genuinely cannot be typed here, **stop and tell Pedro** — do not re-introduce the shim silently.

**3. `App.tsx` is 4,458 lines, not 4,861.** Every line number in the original brief is stale. The numbers in this document are re-derived from `origin/master`; re-confirm them before editing, since your own edits will shift them as you go.

---

## 2. Fix A — restore `zustand/middleware`

Do this first and commit nothing else until `npm run typecheck` is green with it, because the rest of the commit reasons about the middleware's rehydration semantics.

### 2.1 What the shim does not do

| Real `persist` | The shim |
|---|---|
| `version` + `migrate` | absent — no way to evolve a store's shape later |
| `partialize` | absent — actions and transient fields are serialized on every write |
| `onRehydrateStorage` / `hasHydrated()` | absent — nothing can observe when hydration finished |
| write coalescing | absent — `setItem` runs on **every** `set`, and again via the patched `api.setState` |
| documented merge semantics | shallow spread, undocumented, wired in two places |

The write-per-`set` behaviour matters for Commit 7: the cart's drag-reorder calls `set` continuously while a card is dragged, and each call now does a full `JSON.stringify` of the store plus a synchronous storage write.

### 2.2 The change

1. Restore the import at the top of `src/state/persistence.ts`:
   ```ts
   import { StateStorage, createJSONStorage, persist } from "zustand/middleware";
   ```
2. Delete the local `StateStorage`, `PersistedStorageValue`, `PersistStorage` types, the local `persist`, and the local `createJSONStorage`.
3. Re-export `persist` so the five store files keep their current import path, or update the five imports — either is fine, but pick one and apply it consistently.
4. Each store's `create<T>()(persist<T>(...))` call becomes the middleware form:
   ```ts
   export const useProductsStore = create<ProductsState>()(
     persist(
       (set) => ({ /* unchanged */ }),
       {
         name: "smart-shoppingcart:products-store:v1",
         storage: createAppJsonStorage(),
         version: 1,
         partialize: (state) => ({ products: state.products })
       }
     )
   );
   ```
   Keep every `name` **byte-identical** to what the shim used, or every device silently starts from defaults. Confirm each one against a real device dump before you change it.
5. Add `partialize` to each store so only data is persisted, not actions. This is a behaviour change in the right direction, but it means the persisted blobs shrink — verify §5.4 (fresh install) *and* §5.1 (existing device) after it.
6. Set `version: 1` on every store now. The shim wrote no version field; zustand treats a missing version as `0` and will call `migrate` — so either provide a `migrate` that passes the state through unchanged, or keep `version: 0` for this commit and bump later. **Prefer `version: 0` now**: fewer moving parts while the watermark work lands in the same commit.

### 2.3 The storage adapter must stay synchronous

`appStateStorage` wraps `expo-sqlite/kv-store` (sync API) on native and `localStorage` on web. §3.4's ordering guarantee depends on rehydration completing synchronously during `create()`. Add a comment saying so, directly above `appStateStorage`:

```ts
// Must stay synchronous until Commit 11. bootstrapLegacyState() in app/_layout.tsx
// assumes persist() has already rehydrated by the time it runs; an async adapter
// breaks that ordering silently, with no typecheck error.
```

---

## 3. Fix B — replace the boolean flag with a `savedAt` watermark

### 3.1 The problem, stated precisely

`app/_layout.tsx` calls `bootstrapLegacyState()` at module scope. On the first launch of the Commit-3 build it hydrated all eight stores from `smart-shoppingcart:v1` and called `markLegacyStateImported()`, which writes `smart-shoppingcart:zustand-import-complete:v1 = "true"`.

`shouldImportLegacyState()` (`persistence.ts:114`) returns `false` from that moment on, permanently. `App.tsx` has kept writing the live list to `smart-shoppingcart:v1` ever since, while the stores hold a frozen snapshot and never re-read it.

Worse, `bootstrapLegacyState()` sets `hasBootstrappedLegacyState = true` *in the early-return branch* — so a session that skips the import still marks itself as having bootstrapped.

Settings now reads those stores. When it writes — any toggle, any name edit — `persist` writes the stale snapshot back. **A one-shot import is the wrong primitive** while two writers coexist. It only becomes correct at Commit 11, when `App.tsx` stops writing.

### 3.2 `src/state/persistence.ts`

Add a watermark key alongside the existing keys. **Keep** `legacyImportCompleteStorageKey` — it changes meaning, it does not disappear.

```ts
export const legacyImportWatermarkStorageKey = "smart-shoppingcart:legacy-import-watermark:v1";
```

Replace the two flag functions (`persistence.ts:114–120`) with watermark-aware equivalents:

```ts
// True only once App.tsx is no longer the writer of record — set at Commit 11.
export function isLegacyCutoverComplete(): boolean {
  return getAppStorage()?.getItem(legacyImportCompleteStorageKey) === "true";
}

export function readLegacyImportWatermark(): string {
  return getAppStorage()?.getItem(legacyImportWatermarkStorageKey) ?? "";
}

export function markLegacyStateImported(savedAt: string): void {
  getAppStorage()?.setItem(legacyImportWatermarkStorageKey, savedAt);
}

export function markLegacyCutoverComplete(): void {
  getAppStorage()?.setItem(legacyImportCompleteStorageKey, "true");
}

export function shouldImportLegacyState(legacySavedAt?: string): boolean {
  if (isLegacyCutoverComplete()) {
    return false;
  }

  if (!legacySavedAt) {
    return false;
  }

  return isSavedAtNewer(legacySavedAt, readLegacyImportWatermark());
}
```

`isSavedAtNewer` must be a **shared** helper, not a second copy. `App.tsx` already has `isSavedStateNewer` (App.tsx:2330) and `parseSavedAt` (App.tsx:2345). Move both to `src/domain/savedAt.ts`, export them, and have `App.tsx` and `persistence.ts` both import from there. Do not duplicate the comparison logic — divergence between two copies is exactly how this class of bug reappears.

Semantics to preserve from the existing `isSavedStateNewer`:

- candidate unparseable → `false` (never import garbage).
- baseline unparseable or empty → `true` (first import always runs).

`markLegacyCutoverComplete()` is exported and unused in this commit. That is intentional; it stops Commit 11 from re-deriving this reasoning.

### 3.3 `src/state/bootstrap.ts`

`bootstrapLegacyState()` becomes re-runnable and watermark-driven:

```ts
// TRANSITIONAL (Pass 1, Commits 5.5–10): App.tsx is still the writer of record,
// so the legacy blob is re-imported whenever it is newer than the watermark.
// At Commit 11, when App.tsx is deleted: call markLegacyCutoverComplete() once,
// which permanently disables this path. The stores become the writer of record.
export function bootstrapLegacyState(): void {
  if (isLegacyCutoverComplete()) {
    return;
  }

  const legacyState = readLegacyAppState();

  if (!shouldImportLegacyState(legacyState?.savedAt)) {
    return;
  }

  const legacySettings = readLegacyUserSettings(defaultStoreId);

  useProductsStore.getState().hydrateFromLegacy(legacyState);
  useShoppingListStore.getState().hydrateFromLegacy(legacyState);
  useStoresStore.getState().hydrateFromLegacy(legacyState);
  useRoutesStore.getState().hydrateFromLegacy(legacyState);
  useTripStore.getState().hydrateFromLegacy(legacyState);
  useSettingsStore.getState().hydrateFromLegacy(legacySettings);
  useSyncStore.getState().hydrateFromLegacy();
  useAuthStore.getState().hydrateFromLegacy();

  markLegacyStateImported(legacyState!.savedAt);
}
```

Note what changed beyond the flag:

- **Drop the `hasBootstrappedLegacyState` module guard** (`bootstrap.ts:17`). The watermark does that job now, and keeping the guard would block the re-import in §3.5.
- The early return no longer marks anything. Marking without importing was the original defect.
- `markLegacyStateImported` is the **last** statement. It must stay last.

### 3.4 Remove the per-store module-level legacy read

Five stores still do this at import time:

```ts
const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;
```

`productsStore.ts:6`, `routesStore.ts:7`, `shoppingListStore.ts:5`, `storesStore.ts:39`, `tripStore.ts:5`. `settingsStore.ts` does the settings equivalent unconditionally.

That is five extra reads of the same blob at module-evaluation time, ordered by import graph rather than by intent, and none of them will compile against the new `shouldImportLegacyState(savedAt)` signature.

**Delete all six.** Each store's initial state falls back to its own defaults (`starterProducts`, `defaultItinerary`, etc.); `bootstrapLegacyState()` in `app/_layout.tsx` becomes the single import path.

Order matters and is already correct: `persist` rehydrates synchronously on store creation, then `bootstrapLegacyState()` overwrites with legacy values when the watermark says the legacy blob is newer.

### 3.5 Re-run the import on every launch, not just the first

`bootstrapLegacyState()` at module scope in `app/_layout.tsx` stays where it is. With the watermark it now runs the import on **every launch where `App.tsx` has written something newer than the last import** — which, while the monolith is still the writer of record, is every launch after any use.

That is the intended behaviour for the transitional period. It is cheap (one JSON parse of a blob we already read) and it guarantees the stores can never be more than one launch stale.

---

## 4. Fix C — move per-device view state out of the synced blob

`listSearch`, `addSearch` and `departmentFilter` are fields of `PersistedAppState` and sit in the persistence effect's dependency array (App.tsx:340–341 onward). Two consequences:

- Every keystroke in a search box schedules a debounced remote upsert of the **entire** app state blob (App.tsx:312–339).
- Every keystroke broadcasts over Realtime to the other family devices and overwrites their search box mid-typing — `applyPersistedAppState` calls `setDepartmentFilter` / `setListSearch` / `setAddSearch` at App.tsx:437–439.

These three are per-device view state. They belong in `LocalUserSettings`.

### 4.1 Changes in `App.tsx`

1. Add `listSearch: string`, `addSearch: string`, `departmentFilter: DepartmentFilter` to the `LocalUserSettings` type (App.tsx:81) and to `defaultLocalUserSettings` (App.tsx:149) as `""`, `""`, `"all"`.
2. Extend `readLocalUserSettings()` (App.tsx:2354) with the same `typeof`-guard pattern the existing fields use; reuse `isDepartmentFilter` (App.tsx:2651) for the filter.
3. Initialise the three `useState` calls (App.tsx:197–199) from `localUserSettings` instead of `initialAppState`.
4. On change, write through to `localUserSettings` so the existing `writeLocalUserSettings` effect persists them.
5. Remove the three fields from the persistence effect's dependency array (App.tsx:340 onward — `addSearch` and `departmentFilter` are the first two entries; `listSearch` is further down the same list).
6. Remove them from `createPersistedAppState()` (App.tsx:388–390) and from `applyPersistedAppState()` (App.tsx:437–439).

### 4.2 Storage version

`PersistedAppState.version` stays at `2` (`types.ts:36`, `CURRENT_STORAGE_VERSION` in `App.tsx`). Removing fields is backward-compatible: `readPersistedAppState` (App.tsx:2231) already tolerates absent keys via `?? ""` and `isDepartmentFilter(...)` guards, and older blobs carrying the three fields are simply ignored. **Do not bump to version 3** — a bump makes `readPersistedAppState` return `null` for every existing device and wipes the family's list.

### 4.3 Mirror in `src/state/types.ts`

Remove the three fields from `PersistedAppState` (`types.ts:45–47`) and add them to `LocalUserSettings`, matching `App.tsx`. Update `readLegacyUserSettings` in `persistence.ts` with the three new guarded fields. `shoppingListStore`'s `hydrateFromLegacy` must stop reading them; `settingsStore`'s must start.

Settings is a live consumer of `settingsStore`, so check `app/(app)/settings/index.tsx` still typechecks and still renders after the type changes — it does not display these three fields today, but it does spread settings state.

### 4.4 Out of scope

`selectedStoreId` **stays synced**. It looks like device state, but the household shares one active trip today. Changing it is a product decision, not a persistence cleanup. Leave it.

---

## 5. Verification — required, and not satisfiable by typecheck

A green typecheck proves nothing here. Produce this evidence in the execution log:

**5.1 Stale-store recovery (the actual bug).** On a device carrying `baseline-legacy.json` and a stale `baseline-store.json`: launch the new build once, then dump `smart-shoppingcart:products-store:v1` again. Its product list must now equal the one in `baseline-legacy.json`. Paste the product counts before and after.

**5.2 Watermark stops the re-import.** Launch again without touching the app. `smart-shoppingcart:legacy-import-watermark:v1` must be unchanged, and no store write must occur. Confirm by dumping the watermark twice.

**5.3 Add-then-relaunch.** Add one product in the app, force-quit, relaunch. The store snapshot must contain the new product, and the watermark must have advanced to the new `savedAt`.

**5.4 Fresh install.** Clear all storage, install, launch. No legacy blob exists → no import → stores carry `starterProducts`. No crash, no empty catalog.

**5.5 Settings survives the middleware swap.** Open `/settings`, toggle `Saltar Início`, set a user name, pick a default store, reload. All three must persist. This is the regression path for §2 — the store `name` keys must not have changed.

**5.6 Search no longer syncs.** Two browser profiles on the same sync space. Type in the Add search box on profile A. Profile B's search box must not change, and the network tab must show **no** upsert to `app_state_snapshots` from the typing alone.

**5.7 Standard gates.** `npm run typecheck`, `npm run i18n:check`, `npx expo export --platform web`.

---

## 6. Do not

- **Do not bundle Commit 5.6 into this one.** 5.5 is persistence, 5.6 is UI. If they land together and a household loses data, the bisect is worthless.
- **Do not start extracting screens.** No file under `app/` gains a screen in this commit. `app/_layout.tsx` and the Settings type-fallout are the only `app/` edits.
- **Do not "fix" the single-JSONB-row sync model.** Last-write-wins is a known beta blocker (review §2.4), tracked as W7.
- **Do not touch RLS.** Review §2.2, also W7.
- **Do not duplicate `isSavedAtNewer`.** One implementation, imported twice.
- **Do not re-introduce a local `persist`.** If the real middleware will not typecheck, stop and report it.

---

## 7. Definition of done

1. `persist` and `createJSONStorage` come from `zustand/middleware`; no local reimplementation remains in `src/state/`.
2. Every store's persisted `name` is unchanged, and an existing device's Settings survive the upgrade.
3. `shouldImportLegacyState` takes a `savedAt` and compares against a watermark.
4. No store reads the legacy blob at module scope.
5. `bootstrapLegacyState()` is re-runnable and self-limiting via the watermark; `hasBootstrappedLegacyState` is gone.
6. `markLegacyCutoverComplete()` exists, is exported, and is unused.
7. `listSearch`, `addSearch`, `departmentFilter` are device-local; typing produces no remote write.
8. Storage version is still `2`; an existing device's list survives the upgrade.
9. All seven verification items in §5 are recorded in the plan's execution log with real numbers, not "verified OK".

---

## 8. Where this is easy to get wrong

- **Changing a store's persisted `name` during the middleware swap.** Silent total data loss per store. Diff the key strings character by character.
- **Watermark comparison inverted.** Re-imports stale legacy state over fresher store state on every launch. §5.2 catches it; do not skip it.
- **`markLegacyStateImported` called before the import completes.** That is the original bug in a new costume. It must be the last statement.
- **Bumping the storage version.** Wipes every household. §4.2.
- **`persist` rehydration racing `bootstrapLegacyState()`.** The storage adapter is synchronous today. If anyone swaps it for an async adapter, this ordering breaks silently — hence the comment in §2.3.
- **Assuming the line numbers in this brief are still right.** They are correct for `3a63eb2`, and your own edits will move them. Re-grep before each change.
