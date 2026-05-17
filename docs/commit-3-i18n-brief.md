# Commit 3 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 3.
**Goal:** scaffold the i18n catalogue, wrap the router in `<I18nextProvider>`, and pre-install the persistence hydration guard. **Zero screen extraction. Zero user-facing copy changes.**

This commit must ship green: `npm run typecheck` passes, `npx expo export --platform web` builds, the app renders on iOS / Android / web with no console errors and no visible UX difference.

---

## 0. Pre-flight

Before touching anything, restore the truncated files in the working tree. The current `git status` shows `package.json`, `app.json`, and `package-lock.json` as modified, and they are mid-line truncated (not intentional edits):

```
git checkout -- package.json app.json package-lock.json
npm install                  # confirm lockfile is consistent
npm run typecheck            # must pass before starting Commit 3
```

If `npm install` mutates `package-lock.json`, commit that as a tiny pre-Commit-3 cleanup ("Restore truncated lockfile") before starting the i18n work. Do not bundle it into Commit 3.

---

## 1. Decisions already made (do not relitigate)

### 1.1 Locale policy

- **Key namespace source of truth:** `en`. Every key is authored in English first. Translators downstream work from the English file.
- **Runtime default:** `pt-PT`. The app continues to ship pt-PT-first for Pedro's household and beta users.
- **Fallback chain:** `pt-BR` → `pt-PT` → `en`. `es` → `en`. `en` → (none).
- **Detection:** `expo-localization`'s device locale is consulted, but only to *upgrade* off the default — if the device reports `pt-*`, stay on `pt-PT` (or `pt-BR` once that namespace exists); if `es-*`, switch to `es` (once it exists); otherwise stay on `pt-PT`. We do **not** want a Portuguese household's device suddenly rendering English just because i18next defaulted to `en`. The runtime default is explicit.
- **`pt-BR` and `es`:** scaffold the *folders* in `src/i18n/locales/` but leave the namespace files empty (or absent) — populating them is downstream of Pass 1. Only `en` and `pt-PT` need real files in this commit.

### 1.2 Persistence hydration guard

Per Plan §6 (risks): when stores start being consumed (Commit 4 onward), they must not hydrate with defaults before the legacy `smart-shoppingcart:v1` blob has been read, or households will lose their lists.

The guard lives in `app/_layout.tsx`. It runs **synchronously, before children render**, and:

1. Calls `shouldImportLegacyState()` from `src/state/persistence.ts`.
2. If true, calls `readLegacyAppState()` + `readLegacyUserSettings(...)` and pushes their values into each zustand store via a one-shot `hydrateFromLegacy(...)` action that each store exposes.
3. Calls `markLegacyStateImported()` so subsequent launches skip the import.

Commit 3 adds this scaffolding even though no screen yet consumes the stores. It is cheap to do now and removes a class of footgun from Commit 4.

If the per-store `hydrateFromLegacy` actions don't exist yet, add them as part of this commit — empty no-ops for stores that don't have a corresponding slice of the legacy blob (`authStore`, for now).

---

## 2. Files to create

### `src/i18n/index.ts`

i18next bootstrap. Responsibilities:

- Initialise `i18next` with `react-i18next`.
- Register namespaces: `common`, `errors`, `welcome`, `auth`, `home`, `list`, `add`, `shop`, `summary`, `route-editor`, `missing`, `settings`. **Twelve namespaces.** The screen-by-screen split matches Plan §2.1.
- Default namespace: `common`.
- Resources: import the JSON files for `en` and `pt-PT` directly (static imports — bundler-friendly). Leave `pt-BR` and `es` unwired for now.
- `fallbackLng: { "pt-BR": ["pt-PT", "en"], "es": ["en"], default: ["en"] }`.
- `lng`: computed by a small helper `resolveInitialLocale()` that reads `expo-localization`'s `getLocales()[0]?.languageTag`, maps it to one of the supported tags via a `mapDeviceLocale(tag)` function, and falls back to `"pt-PT"`. **Mapping rules:** any `pt-BR` → `pt-BR`; any other `pt-*` → `pt-PT`; any `es-*` → `es`; everything else → `pt-PT` (explicit pt-PT-first default, NOT `en`).
- `interpolation.escapeValue: false` (React already escapes).
- `compatibilityJSON: 'v4'` (i18next v23+ default; specify explicitly).
- Export the initialised i18next instance as default and a named `resolveInitialLocale` for tests.

### `src/i18n/format.ts`

Light helper for dates and numbers via `Intl.DateTimeFormat` / `Intl.NumberFormat`, using the active i18next locale. Plan §2.4 references it. Stub OK — exports `formatDate(date, opts?)`, `formatNumber(value, opts?)`, `formatRelativeDays(date)`. Implementations can be one-liners for now; we just need the surface to exist so screen extractions in Commits 4–10 can import without churn.

### `src/i18n/README.md`

Document, in roughly this order:

1. The locale policy from §1.1 above.
2. The namespace list and which screen owns which namespace.
3. The rule: "every JSX text node must be wrapped in `t(...)` — no string concatenation across `t()` calls — pluralization uses i18next's `{{count}}`."
4. How to add a new key (edit `en/<ns>.json` first, then mirror in `pt-PT/<ns>.json`).
5. How to add a new locale (folder, 12 files, register in `index.ts`).

### `src/i18n/locales/en/<namespace>.json` and `src/i18n/locales/pt-PT/<namespace>.json`

Twelve files per locale, **all `{}`**. No keys yet. Commit 4 onward fills them as each screen is extracted.

`src/i18n/locales/pt-BR/` and `src/i18n/locales/es/` exist as empty directories (commit a `.gitkeep` if needed) so the layout matches the plan, but they have no JSON files yet.

### `scripts/i18n-check.mjs`

Grep-based lint. **Warning-only at this stage** (Plan §3 Commit 3: warnings; promoted to error in Commit 11).

- Walk `app/**/*.{ts,tsx}` and `src/**/*.{ts,tsx}` (exclude `src/i18n/**`, `src/data/**`, `node_modules`).
- Flag any JSX text node that is a plain string literal — i.e., `>Hello<` patterns or `<Text>{"Hello"}</Text>` — outside an `t(...)` call.
- A simple regex pass is sufficient: `/>\s*[A-Za-zÀ-ÿ][^<{]*</` excluding lines that look like `<Trans>` or `t(`.
- Exit code 0 always (warning mode); print a count and per-file list. We'll flip exit code to 1 in Commit 11.

Wire it into `package.json`:

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "i18n:check": "node scripts/i18n-check.mjs"
}
```

---

## 3. Files to modify

### `app/_layout.tsx`

Wrap the existing `<Stack>` in `<I18nextProvider i18n={i18n}>`. Above the provider, run the synchronous legacy-import bootstrap (§1.2). Pseudo-shape:

```tsx
import { Stack } from "expo-router";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/i18n";
import { bootstrapLegacyState } from "../src/state/bootstrap";

// Module-level: runs once at import time, synchronously, before any provider mounts.
bootstrapLegacyState();

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <Stack screenOptions={{ headerShown: false }} />
    </I18nextProvider>
  );
}
```

`bootstrapLegacyState()` lives in a new file `src/state/bootstrap.ts` and orchestrates the legacy-import flow described in §1.2. Keeping it module-scoped means the import runs before `RootLayout` is even rendered — no `useEffect`, no race with the first screen mount.

### `src/state/bootstrap.ts` (new file referenced above)

Reads legacy blobs and calls each store's `hydrateFromLegacy(...)`. Skips when `shouldImportLegacyState()` returns false. Idempotent.

### `src/state/<each>Store.ts`

Add a `hydrateFromLegacy(slice)` action to each store. For stores that don't have a corresponding slice in the legacy blob (e.g. `authStore`), the action is a no-op but exists for symmetry.

### `package.json`

Add the `i18n:check` script line. Nothing else.

---

## 4. Out of scope for Commit 3

Reject the diff if Codex touches any of these:

- Any file under `app/` other than `_layout.tsx`.
- Any screen function inside `App.tsx`.
- Any visible copy change. The app still renders pt-PT strings from `App.tsx` literals exactly as before.
- Populating `pt-BR` or `es` JSON files.
- Promoting `i18n:check` from warning to error.
- Touching `metro.config.js`, `babel.config.js`, or native config beyond what i18next demands. (i18next is JS-only; it should not require any.)
- Any change to `lib/supabase.ts`, `lib/deviceStorage.ts`, or `domain/routeInference.ts`.

---

## 5. Validation Codex must run before signing the commit

1. `npm run typecheck` — passes.
2. `npx expo export --platform web --clear --output-dir dist-router-smoke` — passes; smoke-browse on the export, confirm no console errors and the app title + nav render. Delete `dist-router-smoke` after.
3. `npm run i18n:check` — runs, prints the count, exits 0.
4. **Hydration test:** with a fresh install state, write a known `smart-shoppingcart:v1` blob into `localStorage` (web target is easiest), reload, confirm the legacy import marker is set and the blob is no longer overwritten on subsequent reloads. Manual test, document the steps in the Execution Log entry.
5. `git diff --stat` — only the files listed in §2 and §3 are touched. No collateral changes.

---

## 6. Execution Log entry

Append to `docs/pass1-split-and-i18n-plan.md` §8 under a new `### 2026-05-17 ... Codex` heading (or whatever date Codex actually finishes on). Mirror the structure of the existing entry: Status / Completed / Validation / Flags / Next recommended step.

The "Next recommended step" should be: **Commit 4 — extract Welcome (`(auth)/welcome.tsx`)**, with the reminder that Welcome is the first screen to actually *consume* the i18n catalogue and the zustand stores, so it's the moment the hydration guard goes live for real.

---

## 7. Definition of done for Commit 3

- `src/i18n/` exists with the structure in §2.
- `app/_layout.tsx` wraps `<Stack>` in `<I18nextProvider>` and runs `bootstrapLegacyState()` at module scope.
- Each zustand store exposes a `hydrateFromLegacy(...)` action.
- `npm run i18n:check` exists and runs.
- All validation in §5 passes.
- One commit, message: `Pass 1 commit 3: scaffold i18n catalogue and hydration guard`.
- Execution Log updated.
