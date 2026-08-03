# UX Decisions Log

A running record of UX-level decisions Pedro has signed off on. Distinct from:

- `pass1-split-and-i18n-plan.md` — *architecture* and execution order for the split.
- `v1-product-deployment-plan.md` — V1 product scope.
- `commit-N-*-brief.md` — one specific commit's mechanics.

Each entry below is a contract. When Codex implements a commit that touches a decided area, it follows these decisions verbatim. Briefs may reference entries here (e.g., "applies §2026-05-18 alternatives control") instead of restating them.

Add new entries at the bottom, dated, never edit historical decisions in place — supersede with a new entry and link the prior one as superseded.

---

## 2026-05-18 — "Aceitar alternativas" row control replaces hidden row-tap toggle

**Context.** In the current `App.tsx` List screen, tapping a row silently toggles the "accepts alternatives" flag on that item. The interaction is invisible, accidentally triggered, and identified in Plan §3 Commit 6 as UX-issue-5. It is removed in Commit 6 and replaced with the explicit control described here.

**Applies to:** Commit 6 (`app/(app)/(tabs)/list.tsx`) and any later screen that surfaces the same per-item flag (Shopping Mode item card preview, Cart row preview).

### Decisions

1. **Placement.** On the row itself, in the row's secondary metadata strip (the area below product name + brand where quantity, note, and last-picked already live). Visible without expanding or opening a detail screen.

2. **Copy.**
   - pt-PT label: `Aceitar alternativas`
   - en label: `Allow alternatives`
   - pt-PT hint: `Permite escolher um produto semelhante se este faltar.`
   - en hint: `Allows picking a similar product if this one is missing.`
   - i18n keys (suggested): `list:row.alternatives.label`, `list:row.alternatives.hint`. Codex may refine the key names if the `list` namespace already has a more specific structure, but the values are the contract.

3. **Interaction.** Only the Switch toggles the flag. The row itself no longer has any tap behaviour that mutates state. Row-tap may still be reserved for *navigation* (e.g., opening a future product-detail screen), but never for mutation of this or any other flag — that pattern is the bug being removed.

4. **Scope.** The control appears on every item row in the List screen for consistency. Future exceptions are allowed only if there is a clear product-type reason (e.g., a generic produce-by-weight item where alternatives are nonsensical). No exception is implemented in Commit 6; if one is ever needed, it is its own decision and gets its own entry here.

5. **Visual treatment.** Native React Native `<Switch>` plus a short text label. No custom toggle styles. Pass-1 styling baseline — Pass-2 may later restyle, but the underlying control stays a `Switch`.

### Accessibility

- `Switch` gets `accessibilityLabel={t('list:row.alternatives.label')}` and `accessibilityHint={t('list:row.alternatives.hint')}`. RN's `Switch` already exposes `accessibilityRole="switch"` by default; do not override.
- The row container itself, since it no longer mutates state on tap, drops any `accessibilityRole="button"` or `accessibilityHint` related to toggling alternatives. If the row gains a navigation role later, that's a separate decision.

### Implementation notes for Codex

- The flag in state is `accepts_alternatives` (Plan §3 Data Model `shopping_list_items.accepts_alternatives`). In the current `App.tsx` it's read off the item object via whatever local prop name Codex finds — preserve the underlying store action name (`toggleAlternatives(productId)` or similar), don't rename in the same commit as the UX change.
- Row height grows by ~one line. Acceptable; do not collapse the existing metadata strip to compensate.
- Do not animate the Switch's appearance — adding/removing a row should not trigger entrance animation in Pass 1.
