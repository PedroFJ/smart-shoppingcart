# Commit 5.7 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3 (inserted between Commit 5.6 and Commit 6).
**Source:** validation of `fb7c057` (Commit 5.5) and `499ba73` (Commit 5.6), 2026-08-03.
**Goal:** make the exported web bundle actually run, and remove the touch-down confirm on native. **Zero screen extraction. Zero new dependencies. No change to app logic.**

This commit is a **blocker for Commit 6**. Until it lands, `npx expo export --platform web` is not a meaningful gate, and every commit that claims it as one is claiming something untested.

---

## 0. Pre-flight

```
pwd                         # C:\Users\PedroFreire\dev\smart-shoppingcart
git log --oneline -1        # must be 499ba73
git fetch && git status -sb # up to date with origin/master
```

No modified tracked files under `App.tsx`, `app/`, `src/` or `supabase/`. Untracked docs are fine.

---

## 1. The web bundle does not run

You flagged this twice, as a footnote, in the 5.5 and 5.6 execution log entries:

> *"The web export bundle contains `import.meta` from the real Zustand middleware while Expo emitted a non-module script tag. The seeded smoke server rewrote the exported script tag to `type="module"` for validation; the export gate itself still passed unchanged."*

That footnote is the most important line in either entry. `import.meta` inside a classic `<script>` is a **parse error**, not a warning — the browser discards the entire bundle and the app renders a blank page. The export command succeeds because bundling and running are different things.

So the current state is: `dist/` is broken, the smoke test passes because the harness patched the artifact before loading it, and Commits 5.5 and 5.6 are both recorded as web-validated on that basis.

This is also the original reason the hand-rolled `persist` shim existed. Commit 4's log cites "a `zustand/middleware` web bundle issue". Commit 5.5 correctly removed the shim, but the underlying resolution problem was never addressed — it was inherited.

### 1.1 Root cause, confirmed

`zustand@5.0.13`'s `package.json` exports map:

```jsonc
"./*": {
  "react-native": { "default": "./*.js" },   // CJS
  "import":       { "default": "./esm/*.mjs" }, // ESM
  "default":      { "default": "./*.js" }    // CJS
}
```

`@expo/metro-config@55.0.21` sets conditions per platform (`build/ExpoMetroConfig.js`, ~line 207):

```js
unstable_conditionsByPlatform: {
  ios: ['react-native'],
  android: ['react-native'],
  web: ['browser'],
}
```

- **iOS / Android** apply `react-native` → `zustand/middleware.js` → CJS → no `import.meta`. This is why native is fine.
- **Web** applies `browser`, which zustand's map does not define. Resolution falls through to Metro's default `unstable_conditionNames`, which includes `import` → `zustand/esm/middleware.mjs` → **`import.meta`**.

Verified in the installed tree:

| File | `import.meta` occurrences |
|---|---|
| `node_modules/zustand/middleware.js` (CJS) | 0 — uses `process.env.NODE_ENV` |
| `node_modules/zustand/esm/middleware.mjs` (ESM) | 2 |

Both occurrences are inside the **devtools** middleware, which this app does not use. Metro does not tree-shake them out, so they ride along with `persist` and `createJSONStorage`.

### 1.2 The fix

There is no `metro.config.js` in the repository. Create one.

**Preferred — scope the override to zustand:**

```js
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// zustand's ESM build references import.meta, which Expo's web export emits into
// a classic <script> tag — a parse error that blanks the whole bundle. Native is
// unaffected because Metro applies the "react-native" export condition there and
// gets the CJS build. Force web to the same CJS build.
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && (moduleName === "zustand" || moduleName.startsWith("zustand/"))) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["require"] },
      moduleName,
      platform
    );
  }

  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
```

This is preferred because its blast radius is one package. If it does not work as written, do not fight it — fall back:

**Fallback A —** set `config.resolver.unstable_conditionNames = ["require"]` globally. One line, but it drops the `import` condition for *every* dependency; any ESM-only package in the tree will resolve differently. Re-run the full export and smoke if you take this route.

**Fallback B —** `config.resolver.unstable_enablePackageExports = false`. Biggest hammer, reverts Metro to `main`-field resolution for everything. Take it only if both above fail, and say so in the log.

**Do not** solve this by reintroducing a local `persist`, by pinning zustand to v4, or by post-processing `dist/`. If none of the three options above works, stop and report — a fourth option probably means the diagnosis in §1.1 is wrong, and I would rather re-diagnose than accept a workaround.

### 1.3 The harness must stop patching the artifact

The smoke server currently rewrites the exported `<script>` tag to `type="module"` before serving it. Remove that rewrite. A harness that modifies the artifact under test is not testing the artifact — it is testing a variant that never ships, and in this case it concealed a total failure for two commits.

If, after the fix, the bundle still needs `type="module"` to load, that is a finding, not a harness setting. Report it.

---

## 2. The native checkout confirm fires on touch-down

`renderCheckoutConfirmButton` in `App.tsx` (native branch):

```tsx
<TouchableOpacity
  style={styles.checkoutButtonCompact}
  onPress={confirmCheckout}
  onPressIn={confirmCheckout}     // ← remove this
>
```

`onPressIn` fires the instant a finger touches the button. The user cannot slide off to abort — which is the standard escape hatch for a destructive control, and the whole point of a two-step confirm. The `checkoutConfirmed` ref keeps it idempotent, so nothing double-fires; the problem is purely that the action commits on touch-down.

`renderCheckoutCancelButton` — check it for the same pattern and remove `onPressIn` there too if present.

The catalog delete confirm (`renderCatalogDeleteAction`) uses `onPress` alone and is correct. Leave it.

**Why this is worth its own item:** the duplication was added to defeat a headless-CDP race inside the 4-second confirm window — a race on the *web* branch, which does not use `TouchableOpacity` at all. So a test-tooling problem was solved on a code path the tests never execute, in the most destructive control in the app, on the two platforms nobody could manually validate.

The web branch's `onMouseDown` + `onClick` pairing has the same smell. Leave it for now if removing it reintroduces the CDP race — web has a mouse, and mouse-down-to-commit is a smaller sin than touch-down-to-commit — but note in the log whether it is still needed once §1.3's harness changes land.

---

## 3. Optional, only if it costs nothing

`pickRowActions` dropped the `width: 102` the 5.6 brief specified in favour of `alignItems: "flex-end"` / `alignSelf: "flex-start"`. The children are 102 wide, so the result is the same and arguably more robust. **Leave it.** Noted here only so the deviation is on the record rather than discovered later.

---

## 4. Verification

**4.1 The bundle loads unmodified.** Export with the standard command, serve `dist/` as-is with no rewriting of any kind, open it in a real browser. Required evidence in the log:

- the exact `<script>` tag from `dist/index.html`, pasted;
- `grep -c "import\.meta" dist/_expo/static/js/web/*.js` → must be `0`;
- browser console output → zero errors, and specifically no `SyntaxError`;
- the app renders the Welcome or List screen, not a blank page.

**4.2 Re-run the 5.5 and 5.6 web smokes against the unmodified bundle.** Both were validated against a patched artifact, so neither result currently stands. Minimum re-runs: Settings persistence across reload (5.5 §5.5), search-does-not-sync (5.5 §5.6), summary flow with picks (5.6 §7.1), `Falta` round-trip (5.6 §7.5), both two-step confirms (5.6 §7.6).

**4.3 Native confirm behaviour.** On a device or simulator: press and hold `Terminar compra`, slide the finger off the button, release. The trip must **not** end. Then tap it normally — the trip must end. If no device is available, say so explicitly rather than marking it passed; it is a two-line change and the risk of deferring the check is low, but it must not be recorded as verified.

**4.4 Gates.** `npm run typecheck`, `npm run i18n:check`, `npx expo export --platform web --clear`.

---

## 5. Definition of done

1. `metro.config.js` exists and resolves zustand to its CJS build on web.
2. `grep -c "import\.meta" dist/_expo/static/js/web/*.js` returns `0`.
3. `dist/` loads in a real browser, unmodified, with an empty console.
4. The smoke harness no longer rewrites the script tag, and no longer needs to.
5. `onPressIn` is gone from the native checkout confirm and cancel buttons.
6. The 5.5 and 5.6 web checks in §4.2 have been re-run against the real bundle and their results restated in the log — the earlier passes are void.
7. The execution-log entry says which of the three resolution options in §1.2 was used, and why the other two were not.

---

## 6. The process point, for the log

Two commits were recorded as web-validated against a bundle that could not load. Nobody was careless: the harness rewrite was disclosed both times, in writing, in the right place. It was disclosed as a footnote under *Flags / Roadblocks* rather than as a failed gate, and a footnote is easy to read past.

Worth adopting as a standing rule, and it is being added to the plan's §6: **if a validation step requires modifying the artifact to pass, the gate has failed.** Report it as a roadblock that blocks the commit, not as a note attached to a commit that shipped.
