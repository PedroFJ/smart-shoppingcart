> **DEFERRED 2026-08-03 — do not execute yet.** Commit 6 is no longer the next
> commit. `docs/commit-5.5-persistence-brief.md` and
> `docs/commit-5.6-ux-fixes-brief.md` come first, and both change the tree this
> brief assumes: 5.5 rewrites `src/state/persistence.ts` and the store
> initialisers, 5.6 shifts every line number in `App.tsx`. Re-anchor this brief
> against `HEAD` after 5.6 lands, then execute it.

# Commit 6 (List) — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3, Commit 6.
**Repo:** `C:\Users\PedroFreire\dev\smart-shoppingcart` (remote `origin → https://github.com/PedroFJ/smart-shoppingcart`). Confirm before starting.
**Predecessor:** Commit 5 (`3a63eb2 Pass 1 commit 5: extract Settings to (app)/settings/index.tsx`) is at `HEAD` on `origin/master`.

**Important:** this is the first commit that includes a deliberate UX *change* (not just a refactor). The hidden row-tap-toggles-alternatives behaviour is removed and replaced per `docs/ux-decisions.md` §2026-05-18. Plan §3 Commit 6 explicitly flagged this. Codex must not pre-empt other UX changes — only the alternatives control changes in this commit.

This commit produces **one application commit**:

- `Pass 1 commit 6: extract List to (app)/(tabs)/list.tsx`

Push to `origin/master` when green.

---

## 0. Pre-flight

```bash
cd "C:\Users\PedroFreire\dev\smart-shoppingcart"
rm -f .git/index.lock
git pull --ff-only origin master
git status                       # must be clean
git rev-parse HEAD               # must be 3a63eb2 or later
npm run typecheck
npm run i18n:check
```

If `git status` is not clean, stop and report.

---

## 1. Scope

**Move:** `ListScreen` (currently `App.tsx:1179`–~1349) into `app/(app)/(tabs)/list.tsx`.

**Behaviour preserved:**

- Department filter rail, search box, "Compra terminada" notice + clear, item rows (quantity, note, "Adiar"), empty states.
- Voice search button when `voiceSearchEnabled`.
- "Adiar" still calls the `skipped` status transition.

**Behaviour changed (one and only one UX change — see `docs/ux-decisions.md` §2026-05-18):**

- The `<TouchableOpacity onPress={onToggleAlternatives}>` that currently wraps the product-info column becomes a plain `<View>`. Row-body tap no longer mutates state.
- A native `<Switch>` + short text label (`Aceitar alternativas` / `Allow alternatives`) appears in the row's secondary metadata strip — visible, scannable, on every needed-status row.
- The `<Text style={styles.preferencePill}>` element ("Alternativas OK" / "Marca exata") is **deleted**. The Switch is the new indicator.
- `formatListItemDetails(item)` should stop returning the alternatives text, since the Switch now expresses it. If `formatListItemDetails` is also used by Shopping Mode / Cart previews, leave a `TODO(commit-8)` comment instead of dropping the text now — those previews still need it until they get their own row component.

Everything else stays.

---

## 2. File layout

Create:

- `app/(app)/(tabs)/_layout.tsx` — `<Tabs />` shell with **one** visible tab (`Lista`) for now. As Add (Commit 7), Shop (Commit 8), and Home (Commit 10) extract, they add tabs here. Use `expo-router`'s `<Tabs>` with `screenOptions={{ headerShown: false }}`. The tab bar can be styled later — Pass-1 ships the default.
- `app/(app)/(tabs)/list.tsx` — the extracted List screen.

Optionally create (extract once now, reuse in Commits 7–8):

- `src/hooks/useVoiceSearch.ts` — move `useVoiceSearch` out of `App.tsx`. Locale-aware (reads from `useSettingsStore.locale` per Plan §2.4 — App.tsx currently hard-codes pt-PT; this commit's voice locale wiring is fine to keep hard-coded if changing it expands scope, but document the deferral).
- `src/ui/components/VoiceSearchButton.tsx` — move `VoiceSearchButton` out of `App.tsx`.

If extracting either of those forces touching App.tsx in more than a trivial way (delete + import), defer to its own micro-commit before Commit 6 lands. But the cleaner path is to do them in Commit 6 so Commits 7–8 don't have to re-extract.

Modify:

- `App.tsx` — replace the `screen === "list"` render branch (`App.tsx:856`–~870) with `<Redirect href="/list" />`. Delete the `ListScreen` function. Delete styles that *only* `ListScreen` used (`itemCard`, `itemColumn`, `itemName`, `itemMeta`, `lastPickedText`, `preferencePill`, `preferenceOpen`, `preferenceExact`, `quantityColumn`, `quantityHeader`, `quantityInput`, `noteColumn`, `noteHeader`, `noteInput`, `fieldLabel`, `listPostponeAction`, `rowAction`, `listContent`, `shoppingDoneNotice`, `shoppingDoneTextColumn`, `shoppingDoneTitle`, `shoppingDoneText`, `noticeClearButton`, `noticeClearButtonText`, `filterBar`, `filterRail`, `filterButton`, `filterButtonActive`, `filterText`, `filterTextActive`, `searchBox`, `searchInput`, `emptyState`, `emptyText`, `secondaryButtonFull`, `secondaryButtonText`). Recreate equivalents inside `list.tsx`'s own StyleSheet. **Do not delete** styles still referenced by `AddScreen`, `ShopScreen`, `SummaryScreen`, or `WelcomeScreen` (some of these names are reused). Audit before deleting.
- `src/i18n/locales/pt-PT/list.json` and `src/i18n/locales/en/list.json` — populate. See §4.
- `docs/pass1-split-and-i18n-plan.md` — append the Execution Log entry. See §7.

---

## 3. State consumption

`ListScreen` currently takes 13 props from App.tsx. After extraction, each maps to a store action or selector:

| Current prop | Source after extraction |
|---|---|
| `items` (needed items) | `useShoppingListStore` — selector that filters `shoppingItems` to `status === "needed"`. Add the selector if it doesn't exist. |
| `departmentFilter` / `onChangeDepartmentFilter` | `useShoppingListStore` — already in the store per Plan §2.2 (line 195–203). |
| `searchText` (listSearch) / `onChangeSearchText` | `useShoppingListStore` — `listSearch` field per Plan §2.2. |
| `shoppingDoneNotice` / `onClearShoppingDoneNotice` | `useShoppingListStore` — `shoppingDoneNotice` field; `clearShoppingDoneNotice()` action. |
| `onRemove` (skipped) | `useShoppingListStore` — `updateItemStatus(productId, "skipped")` action. |
| `onToggleAlternatives` | `useShoppingListStore` — keep the existing `toggleAcceptsAlternatives(productId)` action name. **Do not rename in this commit.** |
| `onChangeNote` | `useShoppingListStore` — `updateItemNote(productId, note)` action. |
| `onChangeQuantity` | `useShoppingListStore` — `updateItemQuantity(productId, quantity)` action. |
| `voiceSearchEnabled` | `useSettingsStore` — already extracted in Commit 5. |

Use hook-selectors that return *the specific slice needed*, not the whole store:

```ts
const items = useShoppingListStore((s) => selectNeededItems(s));
const setListSearch = useShoppingListStore((s) => s.setListSearch);
```

If `useShoppingListStore` does not yet have actions or fields named above, add them (with the same naming pattern as Commit 4/5 store consumers). This is store completion, not store redesign — keep changes minimal and additive.

---

## 4. i18n keys

Both `pt-PT/list.json` and `en/list.json` get the same shape. Suggested keys (Codex may refine names if a collision exists with `common`):

```jsonc
{
  "headerTitle": "Lista",
  "shoppingDone": {
    "title": "Compra terminada",
    "body": "A Lista já foi atualizada com os produtos que ficaram por apanhar.",
    "clear": "Limpar"
  },
  "filter": {
    "all": "Tudo",
    "ariaLabel": "Filtrar por departamento"
  },
  "search": {
    "placeholder": "Procurar na lista",
    "ariaLabel": "Procurar na lista"
  },
  "empty": {
    "noItems": "A Lista está vazia. Use Adicionar para escolher só o que quer comprar.",
    "noVisible": "Não há produtos nesta vista. Limpe a pesquisa ou escolha outro departamento.",
    "clearFilters": "Limpar filtros"
  },
  "row": {
    "alternatives": {
      "label": "Aceitar alternativas",
      "hint": "Permite escolher um produto semelhante se este faltar."
    },
    "quantity": {
      "label": "Qtd",
      "placeholder": "1 un",
      "ariaLabel": "Quantidade"
    },
    "note": {
      "label": "Nota",
      "placeholder": "Nota",
      "ariaLabel": "Nota do produto"
    },
    "postpone": "Adiar",
    "postponeHint": "Move este produto para fora da Lista atual."
  }
}
```

For `en/list.json`, faithful English translations. The `row.alternatives.*` values are pinned by `docs/ux-decisions.md` §2026-05-18:

- en label: `Allow alternatives`
- en hint: `Allows picking a similar product if this one is missing.`

For all other en keys, mirror the meaning concisely. Examples: `headerTitle: "List"`, `shoppingDone.title: "Shopping done"`, `filter.all: "All"`, `search.placeholder: "Search the list"`, `empty.noItems: "The List is empty. Use Add to choose only what you want to buy."`, `row.quantity.label: "Qty"`, `row.postpone: "Postpone"`.

Only `list.json` is touched this commit. Other namespaces unchanged.

---

## 5. UX-issue-5 fix — alternatives control

Apply `docs/ux-decisions.md` §2026-05-18 verbatim. The contract is there; do not paraphrase or "improve" it. Key implementation notes the decision log already covers and Codex must follow:

- The row container loses any `accessibilityRole="button"` or `accessibilityHint` tied to toggling alternatives.
- The Switch gets `accessibilityLabel={t('list:row.alternatives.label')}` and `accessibilityHint={t('list:row.alternatives.hint')}`. Do not override `accessibilityRole` — RN's `Switch` already exposes `switch`.
- The "preferencePill" `<Text>` is deleted along with its styles.
- Row height grows by one line — accepted; do not compress the existing metadata strip.
- No entrance/exit animation on the Switch.

---

## 6. Accessibility baseline (full row)

- **Department filter buttons:** `accessibilityRole="button"`, `accessibilityLabel={section.name}` (or `t('list:filter.all')`), `accessibilityState={{ selected: isActive }}`.
- **Search TextInput:** `accessibilityLabel={t('list:search.ariaLabel')}`.
- **VoiceSearchButton:** if extracted in §2, ensure it carries its own `accessibilityRole="button"` + label/hint. If left in App.tsx, leave its a11y as-is.
- **Quantity TextInput, Note TextInput:** `accessibilityLabel={t('list:row.quantity.ariaLabel')}` and `t('list:row.note.ariaLabel')` respectively. Compose with product name where helpful: `accessibilityLabel={t('list:row.quantity.ariaLabel') + ' — ' + item.name}` for screen-reader clarity (the row contains many controls).
- **"Adiar" button:** `accessibilityRole="button"`, `accessibilityLabel={t('list:row.postpone')}`, `accessibilityHint={t('list:row.postponeHint')}`.
- **"Limpar" buttons** (shoppingDone clear, empty-state clearFilters): `accessibilityRole="button"`, `accessibilityLabel` keyed.
- **Row container itself:** no role, no label. It's a passive container now.

---

## 7. Validation

```bash
npm run typecheck
npm run i18n:check               # warning mode; zero plain JSX text in list.tsx
npx expo export --platform web --clear --output-dir dist-router-smoke
                                  # delete dist-router-smoke after
```

**Manual smoke tests** (web):

1. **Navigation in.** From App.tsx tab bar, tap "Lista". Route lands on `/list` (via Redirect). All current items render. Department filter rail shows only sections with items present.
2. **UX-issue-5 fix.** Tap a row's product-info area. **No** alternatives toggle fires. Tap the row's Switch. Alternatives toggles, indicator updates, persists across reload.
3. **Quantity & note.** Edit quantity in one row, blur. Persists. Edit note. Persists. Re-render confirms `useShoppingListStore` is the source of truth.
4. **Adiar.** Tap "Adiar" on a row. Item leaves the visible list (status → skipped). Reload, still gone.
5. **Search & filter.** Type in search → list filters. Change department → list filters. With no matches, empty-state appears with working "Limpar filtros" button.
6. **Voice search.** With `voiceSearchEnabled = true` in Settings, the mic button appears. Toggle it off in Settings, return to /list, button is gone.
7. **Compra terminada notice.** Force `shoppingDoneNotice = true` via dev tools or by finishing a trip. Notice renders. Tap "Limpar". Notice disappears, state clears, persists.
8. **Navigation out.** From /list, use browser back. Returns to App.tsx where Add/Shop/Summary are still reachable. (Proper tab bar lands in later commits.)
9. **Welcome & Settings regressions.** Clear localStorage → Welcome appears → "Começar" → home. Open Settings → all toggles work. Both Commit 4 and Commit 5 must remain green.

Document outcomes in the Execution Log entry.

---

## 8. Out of scope (reject the diff if Codex touches these)

- Any screen other than List. Add, Shop, Summary stay in App.tsx until their commits.
- The drag-and-drop reorder, swipe actions, or section dividers (those are Plan W4 / Commit 8 territory).
- Renaming any store action (`toggleAcceptsAlternatives` etc.) — keep names stable until the migration completes.
- Restyling the filter rail, search box, item cards beyond what's needed to fit the Switch.
- A proper tab bar with all five tabs. One visible tab in `(tabs)/_layout.tsx` is enough for this commit.
- Extracting helpers (`formatListItemDetails`, `formatLastPicked`, `normalizeQuantityText`, `filterBySearch`, `getSectionCardStyle`, `webSearchInputChromeReset`) that other still-in-App.tsx screens also use. Import them from App.tsx for now. If a helper is *only* used by List, Codex may move it to `src/domain/listHelpers.ts` opportunistically — but no broader refactor.
- Promoting `i18n:check` from warning to error.

---

## 9. Execution Log entry

Append to `docs/pass1-split-and-i18n-plan.md` §8 a new `### 2026-05-... Europe/Lisbon - Codex - Pass 1 commit 6 (List)` heading. Same structure as Commit 4/5: Status / Completed / Validation / Flags / Next recommended step. Include the nine smoke-test outcomes.

Next recommended step: **Commit 7 — extract Add (`(app)/(tabs)/add.tsx`)** per Plan §3 Commit 7. Note that Commit 7 brings `productsStore` mutation actions online and moves the "Produto novo" inline form to a dedicated modal route (`app/(app)/products/new.tsx`).

---

## 10. Definition of done

- One commit pushed to `origin/master`: `Pass 1 commit 6: extract List to (app)/(tabs)/list.tsx`.
- `git status` is clean.
- New files: `app/(app)/(tabs)/_layout.tsx`, `app/(app)/(tabs)/list.tsx`, and (recommended) `src/hooks/useVoiceSearch.ts`, `src/ui/components/VoiceSearchButton.tsx`.
- `ListScreen` deleted from `App.tsx`; render branch is `<Redirect href="/list" />`.
- `preferencePill` element and its `acceptsAlternatives ? "Alternativas OK" : "Marca exata"` text are gone from the row.
- Switch + label control is on every needed-status row, with the i18n keys and a11y attributes from §4–§6.
- `pt-PT/list.json` and `en/list.json` populated; other namespaces unchanged.
- All nine smoke tests in §7 pass.
- Welcome and Settings regressions pass.
- Execution Log entry present.
- This brief (`docs/commit-6-list-brief.md`) is committed alongside the implementation.
