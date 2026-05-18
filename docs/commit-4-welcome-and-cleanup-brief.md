# Commit 4 (Welcome) + Pre-Commit-4 Cleanup — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 4.
**Repo:** must be the new non-OneDrive clone at `C:\Users\PedroFreire\dev\smart-shoppingcart` (remote `origin → https://github.com/PedroFJ/smart-shoppingcart`). Confirm this before doing anything else.

This brief produces **three commits**, in order:

1. **Normalize line endings to LF** via `.gitattributes` and `git add --renormalize .`.
2. **Tighten `.gitignore`** patterns.
3. **Pass 1 commit 4: extract Welcome to `(auth)/welcome.tsx`**, the real Pass-1 work.

Each commit ships green: `npm run typecheck`, `npm run i18n:check`, and a web export build must all pass before the commit lands. Push each commit to `origin/master` individually (no batched force-push).

---

## 0. Pre-flight (every session, going forward)

```bash
cd "C:\Users\PedroFreire\dev\smart-shoppingcart"
rm -f .git/index.lock           # clear any stale lock from a previous session
git status                       # must succeed without index errors
git rev-parse --abbrev-ref HEAD  # confirm: master (or main)
git remote -v                    # confirm: origin → https://github.com/PedroFJ/smart-shoppingcart
git pull --ff-only origin master # in case anything was pushed from elsewhere
```

If `git status` reports the 65 unstaged-modifications line-ending diff described in §1, that's expected — Phase 1 fixes it. Do not commit those changes any other way.

If the path is *not* the dev path above, stop. The OneDrive copy is decommissioned; we never edit it again.

---

## 1. Phase 1 — Normalize line endings to LF

**Why:** the Windows clone has CRLF in the working tree while `HEAD` has LF. `git status` shows 65 files as modified with no actual content changes. Without `.gitattributes`, every future commit will pull in stray CRLF changes.

### 1.1 Create `.gitattributes`

```
# Default: treat as text, normalize to LF on commit, leave working-tree as-is on checkout.
* text=auto eol=lf

# Force LF on common source extensions (defense in depth).
*.ts        text eol=lf
*.tsx       text eol=lf
*.js        text eol=lf
*.jsx       text eol=lf
*.json      text eol=lf
*.md        text eol=lf
*.yml       text eol=lf
*.yaml      text eol=lf
*.sql       text eol=lf
*.sh        text eol=lf

# Binary — never normalize.
*.png       binary
*.jpg       binary
*.jpeg      binary
*.gif       binary
*.ico       binary
*.webp      binary
*.pdf       binary
*.zip       binary
*.gz        binary
*.tgz       binary
*.ttf       binary
*.otf       binary
*.woff      binary
*.woff2     binary
*.mp3       binary
*.mp4       binary
*.wav       binary
*.keystore  binary
*.aab       binary
*.apk       binary
*.ipa       binary
```

### 1.2 Renormalize the tree

```bash
git add .gitattributes
git add --renormalize .
git status --short              # expect: only files that actually had CRLF, all staged
git commit -m "Normalize line endings to LF via .gitattributes"
git push origin master
```

### 1.3 Validate

```bash
git diff HEAD~1 HEAD --stat | tail -5     # most of the 65 files appear as touched (line-endings only)
file app/_layout.tsx                       # expect: "ASCII text" (no "with CRLF line terminators")
git status                                 # expect: clean
npm run typecheck                          # expect: pass
npm run i18n:check                         # expect: pass (warning mode)
```

If `git diff` shows actual content changes (not just line endings), stop and report — the renormalize captured more than expected.

---

## 2. Phase 2 — Tighten `.gitignore`

**Why:** current `.gitignore` is minimal. Codex flagged in the 2026-05-18 00:16 log entry that broader patterns should be added.

Replace the entire `.gitignore` with:

```
# Node / npm
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Expo / React Native
.expo/
.expo-shared/
*.tsbuildinfo

# Build output
dist*/
web-build/
build/

# Native build artifacts
*.aab
*.apk
*.ipa
*.keystore

# Environment
.env
.env.*
!.env.example

# Coverage / test
coverage/
*.log

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo
```

### 2.1 Verify nothing already committed is now ignored

```bash
git ls-files --error-unmatch \
  $(git ls-files | xargs -I{} git check-ignore -v {} 2>/dev/null | awk '{print $NF}') 2>&1
```

If that command reports any tracked file as newly ignored (most likely candidate: `dist-router-smoke/` — but that was deleted, so it shouldn't appear; or a `.env.example` if it's listed), confirm the file is *intentionally* tracked and leave it tracked (gitignore doesn't untrack already-tracked files). No untracking in this commit.

### 2.2 Commit

```bash
git add .gitignore
git commit -m "Tighten .gitignore patterns"
git push origin master
```

### 2.3 Validate

```bash
git status                       # expect: clean
npm run typecheck                # expect: pass
```

---

## 3. Phase 3 — Commit 4: Extract Welcome to `(auth)/welcome.tsx`

This is the real Pass-1 work. Follow Plan §3 Commit 4 and the extraction recipe defined there.

### 3.1 Scope

**Move:** the `WelcomeScreen` component currently at `App.tsx:1216–~1250` into a new file at `app/(auth)/welcome.tsx`.

**Behavior changes (intentional, per the plan):**

- The current `ScrollView` of three steps becomes a `FlatList` with `pagingEnabled` and a step indicator (three dots, current dot filled).
- A primary CTA labelled **"Começar"** appears at the bottom; pressing it sets `settingsStore.smartStartEnabled = true` and navigates to `/(app)/(tabs)/home`.
- The existing pt-PT copy in `App.tsx:1216–1250` is preserved verbatim in `pt-PT/welcome.json`. English in `en/welcome.json` is a faithful translation of the same copy (you author it; Pedro will review the en strings).

**Behavior preserved:**

- `showWelcome` logic stays as it is in App.tsx (currently `!localUserSettings.smartStartEnabled`). The redirect path described in §3.4 below carries this over.

### 3.2 File layout

Create:

- `app/(auth)/_layout.tsx` — a `<Stack screenOptions={{ headerShown: false }} />` for the `(auth)` group. Keeps the auth group's own header rules separate.
- `app/(auth)/welcome.tsx` — the extracted screen.

### 3.3 i18n keys

Add to **both** `src/i18n/locales/pt-PT/welcome.json` and `src/i18n/locales/en/welcome.json` the same shape. Suggested keys (Codex may refine if a key collides with copy structure):

```jsonc
{
  "headline": "...",
  "intro": "...",
  "steps": {
    "list":  { "title": "...", "body": "..." },
    "add":   { "title": "...", "body": "..." },
    "shop":  { "title": "...", "body": "..." }
  },
  "cta": "Começar",
  "stepIndicator": "Passo {{current}} de {{total}}"
}
```

The three step keys (`list`, `add`, `shop`) come from the existing App.tsx step content ("Prepare a Lista", "Use Adicionar", and the third step at App.tsx:1242 — read its title and map appropriately).

After Codex fills these, `pt-PT/welcome.json` and `en/welcome.json` are the only JSON files this commit touches. Other namespaces stay `{}`.

### 3.4 Handoff from `App.tsx`

App.tsx currently renders `<WelcomeScreen />` inside its screen state machine when `screen === "welcome"` (App.tsx:871–873). Replace that render with `<Redirect href="/welcome" />` from `expo-router`. **Keep** the `WelcomeScreen` function in App.tsx for now? **No — delete it.** The plan recipe is explicit: "Delete the screen function from `App.tsx`".

The cascading effect: if App.tsx imports anything used only by `WelcomeScreen` (e.g. `welcomeContent`, `welcomePanel`, `welcomeTitle`, `welcomeText`, `welcomeSteps`, `welcomeStep`, `welcomeStepNumber`, `welcomeStepText`, `welcomeStepTitle` from the StyleSheet), delete those style entries from App.tsx and recreate the equivalent (or improved) styles inside `welcome.tsx`. App.tsx's diff should shrink by ~35–50 lines.

### 3.5 State consumption

`WelcomeScreen` is the first screen that *consumes* `settingsStore` for real. Wire it via:

```tsx
const smartStartEnabled = useSettingsStore((s) => s.smartStartEnabled);
const setSmartStartEnabled = useSettingsStore((s) => s.setSmartStartEnabled);
```

The "Começar" handler calls `setSmartStartEnabled(true)` then `router.replace("/(app)/(tabs)/home")` (assuming home tab exists; if not yet, route to `/`).

**This is the moment the hydration guard becomes live.** Test scenario in §3.7 confirms a household whose legacy `smart-shoppingcart:v1` blob had `smartStartEnabled: true` lands directly on home (welcome redirect doesn't fire) instead of seeing Welcome again.

### 3.6 Accessibility (Pass-1 baseline)

Every interactive element gets:

- `accessibilityRole` — `"button"` for the CTA; `"adjustable"` for the FlatList paging container.
- `accessibilityLabel` — keyed to i18n. CTA label is `t('welcome:cta')`. Each step card's `accessibilityLabel` is `t('welcome:stepIndicator', { current: index+1, total: 3 }) + ' — ' + t(\`welcome:steps.${key}.title\`)`.
- `accessibilityHint` — for the CTA: `t('welcome:ctaHint')` (a short "Open the active list" — Codex adds the key to `welcome.json`).

Step indicator dots get `accessibilityElementsHidden={true}` and `importantForAccessibility="no"` to avoid double-announcing.

### 3.7 Validation

```bash
npm run typecheck                 # pass
npm run i18n:check                # pass (warning mode); zero plain JSX text in welcome.tsx
npx expo export --platform web --clear --output-dir dist-router-smoke
                                  # pass; delete dist-router-smoke after
```

**Manual smoke tests** (web is fine for both):

1. **Fresh state:** clear localStorage, load app. App routes to `/welcome` (because `smartStartEnabled` defaults to false). FlatList pages through three steps. "Começar" navigates to home and sets `smartStartEnabled` true.
2. **Returning user:** with `smartStartEnabled: true` already in localStorage (from a legacy blob via the hydration guard), reload. App routes straight to home, skipping welcome.
3. **Reset:** in dev tools, unset `smartStartEnabled` and reload — welcome should appear again.

Document the three smoke-test outcomes in the Execution Log entry.

### 3.8 Commit

```bash
git add -A
git status                                          # review the diff carefully
git diff --stat HEAD                                # expect: ~5-8 files touched
                                                    #   new: app/(auth)/_layout.tsx
                                                    #   new: app/(auth)/welcome.tsx
                                                    #   modified: App.tsx (deletions)
                                                    #   modified: src/i18n/locales/pt-PT/welcome.json
                                                    #   modified: src/i18n/locales/en/welcome.json
                                                    #   modified: docs/pass1-split-and-i18n-plan.md (Execution Log)
                                                    #   maybe modified: app/index.tsx if redirect logic changed
git commit -m "Pass 1 commit 4: extract Welcome to (auth)/welcome.tsx"
git push origin master
```

---

## 4. Out of scope (reject the diff if Codex touches these)

- Any screen other than Welcome. List, Add, Shop, Settings stay in App.tsx until their own commits.
- Auth UI (sign-in, create-household, join-household). Welcome is a static value-prop carousel; it does not gate behind auth in V1.
- Dark mode, design tokens, color refactors. Pass 2.
- Changing the legacy storage keys.
- Adding new i18n languages beyond `en` and `pt-PT`.
- Promoting `npm run i18n:check` from warning to error mode. (Plan §3 Commit 11.)

---

## 5. Execution Log entries

Append three entries to `docs/pass1-split-and-i18n-plan.md` §8, in chronological order at the bottom:

1. `### 2026-05-18 ... Codex — Normalize line endings` — Phase 1 result.
2. `### 2026-05-18 ... Codex — Tighten .gitignore` — Phase 2 result.
3. `### 2026-05-18 ... Codex — Pass 1 commit 4 (Welcome)` — Phase 3 result, including the three smoke-test outcomes.

The third entry's "Next recommended step" is **Commit 5 — extract Settings (`(app)/settings/index.tsx`)** per Plan §3 Commit 5.

---

## 6. Definition of done

- Three commits pushed to `origin/master` (line endings, gitignore, Welcome) in that order.
- `git status` is clean.
- `file app/_layout.tsx` reports "ASCII text" with no "CRLF line terminators".
- New files exist: `app/(auth)/_layout.tsx`, `app/(auth)/welcome.tsx`.
- `WelcomeScreen` no longer exists in `App.tsx`; its render branch is `<Redirect href="/welcome" />`.
- `pt-PT/welcome.json` and `en/welcome.json` contain real keys; other namespaces remain `{}`.
- All three smoke tests in §3.7 pass.
- All three Execution Log entries are present.
- The brief itself (this file) is committed somewhere within the three commits — bundle it into the Welcome commit, not the cleanup ones.
