# Commit 5 (Settings) — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 5.
**Repo:** must be `C:\Users\PedroFreire\dev\smart-shoppingcart` (remote `origin → https://github.com/PedroFJ/smart-shoppingcart`). Confirm before starting.
**Predecessor:** Commit 4 (`823fb8e Pass 1 commit 4: extract Welcome to (auth)/welcome.tsx`) is at `HEAD` on `origin/master`.

This commit produces **one application commit**:

- `Pass 1 commit 5: extract Settings to (app)/settings/index.tsx`

Plus the usual Execution Log entry. Push to `origin/master` when green.

---

## 0. Pre-flight

```bash
cd "C:\Users\PedroFreire\dev\smart-shoppingcart"
rm -f .git/index.lock
git pull --ff-only origin master
git status                       # must be clean
git rev-parse HEAD               # must be 823fb8e or a later upstream commit
npm run typecheck                # baseline must pass before we start
npm run i18n:check               # baseline must pass (warning mode)
```

If `git status` is *not* clean, stop and report. Do not start the extraction on top of half-done work.

---

## 1. Scope

**Move:** the `SettingsScreen` component currently at `App.tsx:1219–~1380` into a new route at `app/(app)/settings/index.tsx`.

The current Settings screen renders seven panels: **Arranque** (smartStart switch), **Utilizador** (userName input), **Conta e palavra-passe** (placeholder — no auth yet), **Partilha familiar** (sync space code + status pill), **Pesquisa** (voiceSearch switch), **Loja** (default-store grid), **Sobre esta app** (version + update channel). All seven survive verbatim into `index.tsx`. No panel content rewrites.

**Create stubs** for the four sibling sub-routes the plan calls out (Plan §2.1):

- `app/(app)/settings/products.tsx`
- `app/(app)/settings/stores.tsx`
- `app/(app)/settings/household.tsx`
- `app/(app)/settings/account.tsx`

Each stub renders a centered "Em breve" placeholder using the `settings:stub.emBreve` i18n key. Routes exist so future commits can fill them in.

**Bring online for real (first non-Welcome store consumers):**

- `useSettingsStore` — full read/write for `smartStartEnabled`, `userName`, `voiceSearchEnabled`, `defaultStoreId`. Replaces every `localUserSettings` field and `onChangeLocalUserSettings(...)` call.
- `useStoresStore` — read `supermarketProfiles` (for the default-store grid) and derive `selectedStoreName` via a selector.
- `useSyncStore` — read `activeSyncSpaceId`, `syncStatus`, and write `syncSpaceDraft` via a `setSyncSpaceDraft(value)` action; the existing `onSaveSyncSpace` logic moves into a `commitSyncSpaceDraft()` action on the store.

The sync-space draft is the *only* piece of local UI state Settings should keep in `useState` if `useSyncStore` doesn't already model it as a draft. Codex's call — prefer putting the draft on the store (Plan §2.4 wants the draft persistent across navigations) but if that requires more than ~5 lines of store change, defer and keep it local for this commit, with a TODO.

---

## 2. File layout

Create:

- `app/(app)/_layout.tsx` — minimal `<Stack screenOptions={{ headerShown: false }} />`. The proper tab-bar shell described in Plan §2.3 lands later (with `(tabs)` in Commits 6–8). For now this is just enough scaffolding so the `(app)` route group resolves.
- `app/(app)/settings/_layout.tsx` — `<Stack screenOptions={{ headerShown: true, headerTitle: t('settings:headerTitle') }} />` so the four sub-routes get a back button and a title. The header title for `index.tsx` should read "Definições" (pt-PT) / "Settings" (en).
- `app/(app)/settings/index.tsx` — the extracted Settings screen.
- `app/(app)/settings/products.tsx` — stub.
- `app/(app)/settings/stores.tsx` — stub.
- `app/(app)/settings/household.tsx` — stub.
- `app/(app)/settings/account.tsx` — stub.

Modify:

- `App.tsx` — replace the `screen === "settings"` render branch (App.tsx:911–926) with `<Redirect href="/settings" />`. Delete the `SettingsScreen` function and any styles only it used (`settingsContent`, `settingsPanel`, `settingsTitle`, `settingsRow`, `settingsRowText`, `settingsLabel`, `settingsText`, `settingsInput`, `settingsDisabledAction`, `settingsDisabledActionText`, `syncPanelHeader`, `syncPanelText`, `syncPill`, `syncSpaceRow`, `syncSpaceInput`, `syncSpaceButton`, `syncSpaceButtonText`, `defaultStoreGrid`, `defaultStoreButton`, `defaultStoreButtonActive`, `defaultStoreButtonText`, `defaultStoreButtonTextActive`, `settingsMeta`). Recreate equivalents inside `index.tsx`'s own StyleSheet — same visual output, scoped locally. The `getSyncPillStyle` helper used by the pill (App.tsx, look for its definition) moves to `index.tsx` or, if Codex sees it's needed by more than just Settings, into `src/ui/components/SyncPill.tsx`. Prefer the latter only if reuse is already obvious.
- `src/i18n/locales/pt-PT/settings.json` — populate. See §3.
- `src/i18n/locales/en/settings.json` — populate with faithful English translations.
- `docs/pass1-split-and-i18n-plan.md` — append the Execution Log entry. See §6.

---

## 3. i18n keys

The exact shape below is suggested; Codex may refine, but the keys named in §4 (a11y) must exist. Both `pt-PT/settings.json` and `en/settings.json` get the same shape.

```jsonc
{
  "headerTitle": "Definições",
  "arranque": {
    "title": "Arranque",
    "smartStart": {
      "label": "Saltar Início",
      "body": "Quando ligado, abre em Lista se houver produtos; se a Lista estiver vazia, abre em Adicionar."
    }
  },
  "user": {
    "title": "Utilizador",
    "intro": "Estas preferências ficam neste telemóvel.",
    "namePlaceholder": "Nome",
    "nameLabel": "Nome do utilizador"
  },
  "account": {
    "title": "Conta e palavra-passe",
    "body": "A app ainda não tem login de utilizador. Para gerir palavras-passe com segurança, o próximo passo é ligar autenticação, por exemplo Supabase Auth, e depois mostrar aqui alterar palavra-passe, terminar sessão e recuperação de conta.",
    "unavailable": "Gestão de password indisponível"
  },
  "family": {
    "title": "Partilha familiar",
    "connectedBody": "A usar o código {{code}}. Todos os telemóveis com este código partilham a mesma lista.",
    "disconnectedBody": "Configure o Supabase para ativar a partilha entre telemóveis. O código fica preparado para quando ligar o sync.",
    "pillSync": "Sync",
    "pillLocal": "Local",
    "codePlaceholder": "codigo-familia",
    "codeLabel": "Código de família",
    "useButton": "Usar",
    "useButtonHint": "Aplica este código à partilha familiar."
  },
  "search": {
    "title": "Pesquisa",
    "voice": {
      "label": "Pesquisa por voz",
      "body": "Mostra o microfone em Lista e Adicionar e usa PT-pt."
    }
  },
  "store": {
    "title": "Loja",
    "intro": "Loja ativa: {{name}}. Escolha a loja predefinida deste telemóvel.",
    "selectHint": "Define como loja predefinida."
  },
  "about": {
    "title": "Sobre esta app",
    "body": "Smart Shoppingcart ajuda a preparar a lista familiar, adicionar produtos, organizar o carrinho pela ordem da loja e aprender percursos de supermercado.",
    "meta": "Versão {{version}} · Canal {{channel}}"
  },
  "stub": {
    "emBreve": "Em breve.",
    "emBreveHint": "Esta secção será preenchida numa próxima atualização."
  }
}
```

Only `settings.json` is touched this commit (both locales). Other namespaces stay as they are. `pnpm i18n:check` (warning mode) must continue to pass.

---

## 4. Accessibility baseline

Every interactive element gets `accessibilityRole`, `accessibilityLabel`, and where helpful `accessibilityHint` and `accessibilityState`. Specifically:

- **Switches** (smartStart, voice): React Native's `Switch` already gets `accessibilityRole="switch"` by default; add explicit `accessibilityLabel={t('settings:arranque.smartStart.label')}` and `accessibilityHint={t('settings:arranque.smartStart.body')}`.
- **TextInputs** (userName, syncSpaceDraft): `accessibilityLabel={t('settings:user.nameLabel')}` / `t('settings:family.codeLabel')`. No `accessibilityRole` (TextInput infers it).
- **"Usar" sync button**: `accessibilityRole="button"`, `accessibilityLabel={t('settings:family.useButton')}`, `accessibilityHint={t('settings:family.useButtonHint')}`.
- **Default-store grid buttons**: `accessibilityRole="button"`, `accessibilityLabel={store.name}`, `accessibilityHint={t('settings:store.selectHint')}`, `accessibilityState={{ selected: isSelected }}`.
- **Sync pill**: `accessibilityLabel={t('settings:family.pillSync')}` or `t('settings:family.pillLocal')` based on state. `accessibilityRole="text"`.

Decorative-only elements (panel titles styled as `Text`) need no roles.

---

## 5. Validation

```bash
npm run typecheck                # pass
npm run i18n:check               # pass (warning); zero plain JSX text in any settings/*.tsx
npx expo export --platform web --clear --output-dir dist-router-smoke
                                  # pass; delete dist-router-smoke after
```

**Manual smoke tests** (web is fine for all):

1. **Settings reachable.** From home, tap "Definições". Route lands on `/settings`. All seven panels render with the existing copy.
2. **Toggles persist.** Flip `Saltar Início` and `Pesquisa por voz`, refresh. Both toggles retain the new values (`useSettingsStore` persistence is working).
3. **Name persists.** Type a name in `Utilizador`, refresh. Name retained.
4. **Default store persists.** Pick a different store in the grid, refresh. Selection retained; `selectedStoreName` updates to match.
5. **Sync space draft + save.** Type a code in the family-sharing input, press "Usar". The code is committed to `useSyncStore`; the panel header re-renders with the new active code. The status pill state matches `isSupabaseConfigured`.
6. **Sub-route stubs reachable.** Manually navigate to `/settings/products`, `/settings/stores`, `/settings/household`, `/settings/account`. Each renders the "Em breve" placeholder. The Settings header back button returns to `/settings`.
7. **Welcome path still works.** Clear localStorage, reload. Welcome appears. Press "Começar". App lands on home (Settings extraction did not break the Commit-4 redirect).

Document all seven smoke-test outcomes in the Execution Log entry.

---

## 6. Out of scope (reject the diff if Codex touches these)

- Any screen other than Settings. List, Add, Shop, Summary, Route Editor stay in `App.tsx` until their own commits.
- Implementing the four stub sub-routes beyond an "Em breve" placeholder.
- Adding real auth wiring to the Account panel (still V1 placeholder copy).
- Dark mode, design tokens, color refactors.
- Promoting `i18n:check` from warning to error.
- Touching any state store beyond `settingsStore`, `storesStore`, `syncStore`.
- Refactoring `App.tsx` beyond what's needed to delete the Settings function and its styles.

---

## 7. Execution Log entry

Append to `docs/pass1-split-and-i18n-plan.md` §8 a new `### 2026-05-... Europe/Lisbon - Codex - Pass 1 commit 5 (Settings)` heading. Follow the structure of the Commit 4 entry: Status / Completed / Validation / Flags / Next recommended step.

The "Next recommended step" is **Commit 6 — extract List (`(app)/(tabs)/list.tsx`)** per Plan §3 Commit 6, noting that Commit 6 is also where the deliberate UX-issue-5 fix lands (hidden row-tap-toggles-alternatives is replaced by a labelled switch).

---

## 8. Definition of done

- One commit pushed to `origin/master`: `Pass 1 commit 5: extract Settings to (app)/settings/index.tsx`.
- `git status` is clean.
- New files exist: `app/(app)/_layout.tsx`, `app/(app)/settings/_layout.tsx`, `app/(app)/settings/index.tsx`, plus the four stubs.
- `SettingsScreen` is deleted from `App.tsx`; the render branch is `<Redirect href="/settings" />`.
- `pt-PT/settings.json` and `en/settings.json` contain real keys; other namespaces unchanged.
- All seven smoke tests in §5 pass.
- The Execution Log entry is present.
- This brief (`docs/commit-5-settings-brief.md`) is included in the commit alongside the implementation, matching the pattern Codex established in Commit 3 and Commit 4.
