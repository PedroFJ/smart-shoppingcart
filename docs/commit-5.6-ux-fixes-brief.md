# Commit 5.6 — Brief for Codex

**Parent plan:** `docs/pass1-split-and-i18n-plan.md` §3 (inserted after Commit 5.5, before Commit 6).
**Source:** `docs/project-review-2026-08-03.md` §3.1, §3.2, §3.3, §3.5, §3.8, re-anchored to `origin/master` at `3a63eb2`.
**Supersedes:** `docs/commit-3.6-ux-fixes-brief.md`. Delete it; its line numbers are from a 4,861-line `App.tsx` that no longer exists, and its §5 targets a component that has since moved out of the monolith.

**Goal:** land the UX fixes that live inside `App.tsx` and do not need the split. **Zero screen extraction. Zero new dependencies.**

**Depends on Commit 5.5.** Do not start until 5.5 is merged and verified.

Ship green: `npm run typecheck`, `npm run i18n:check`, `npx expo export --platform web`, and a manual pass of the full loop on iOS / Android / web.

---

## 0. Why these five, and why now

The extraction has already demonstrated it can stall for eleven weeks. Everything in this commit is a defect against the V1 spec that the household feels *today*, and all of it is reachable without touching the router. If the split stalls again, the app on the family's phones is materially better than it is now.

Yes, this means each item gets moved a second time during Commits 6–8. That rework is accepted deliberately — the items are small, and the alternative is shipping known spec violations for another quarter.

**Strings:** for anything still inside `App.tsx`, hard-code pt-PT inline, matching the surrounding code. Do **not** add keys to `src/i18n/locales/` for monolith screens — the screens that own those strings get translated when they are extracted, and adding keys now creates orphans that `i18n:check` cannot validate against a consumer. §5 is the exception: Welcome has already been extracted, so its fix *is* a locale-file edit.

---

## 1. Route learning has no UI — wire the Summary screen (highest value)

### 1.1 The defect

`setScreen("summary")` is never called. `"summary"` appears in `App.tsx` only as the type declaration (23–24) and as render guards (840, 911, 922). Therefore:

- `SummaryScreen` (App.tsx:1907) is dead code.
- `saveInferredRoute()` (App.tsx:781) never runs.
- `inferredRoute` (App.tsx:374) is recomputed on every render and never displayed.
- `pickEvents` accumulate through the trip and are cleared by `finishShoppingTrip()` (App.tsx:812) without ever being used.

The V1 acceptance criteria require *"The app proposes a route after the trip"* and *"The route can be adjusted and reused."* Neither is reachable. Route learning currently happens only as a side effect of the user manually dragging cart cards — the user does the learning and the app takes the credit.

### 1.2 The fix — split trip-end into two steps

`finishShoppingTrip()` (App.tsx:812–825) today does everything at once: rebuild the next list, clear pick events, reset trip flags, navigate to List. Split it.

```ts
function endShoppingTrip() {
  const hasLearnedPicks = pickEvents.some((event) => event.action === "picked");

  if (hasLearnedPicks) {
    setScreen("summary");   // do NOT clear pickEvents yet
    return;
  }

  finalizeShoppingTrip();
}

function finalizeShoppingTrip() {
  // exact body of the current finishShoppingTrip()
}
```

- `lockCheckoutList()` (App.tsx:808) calls `endShoppingTrip()` instead of `finishShoppingTrip()`.
- `saveInferredRoute()` (App.tsx:781) keeps its `setStoreItineraries` call, drops `setPickEvents([])` (787) and `setScreen("list")` (789), and ends by calling `finalizeShoppingTrip()` — which already clears pick events and navigates.
- **Delete `setItinerary(inferredRoute.sectionIds)` (App.tsx:786).** The global `itinerary` is a legacy field; the per-store `storeItineraries` entry is what `selectedStoreRoute` actually reads. Writing both means a future store selection inherits the wrong route.

**Sequencing caution:** the summary renders *before* the list is rebuilt, so `shoppingItems` still carries picked/missing statuses while it is on screen. `SummaryScreen` reads only `route`, `confidence` and `storeName` (App.tsx:1907–1919), so this is safe — but do not add anything to that screen that reads `shoppingItems`.

### 1.3 `SummaryScreen` gains a third action

Current props: `onSave`, `onBack`. Add `onDiscard`.

| Button | Copy | Behaviour |
|---|---|---|
| Primary | `Guardar percurso` | `saveInferredRoute()` → saves route, finalizes trip, → List |
| Secondary | `Terminar sem guardar` | `finalizeShoppingTrip()` → finalizes trip, route unchanged, → List |
| Tertiary | `Voltar ao carrinho` | `setScreen("shop")` — trip **not** finalized |

`Voltar ao carrinho` is the existing `onBack`. Keep it, but change its copy from `Voltar` — "Voltar" next to two trip-ending buttons reads as "cancel", and it is the only one of the three that does not end the trip.

The nav tabs are hidden on the summary screen (App.tsx:840, 922), so these three buttons are the only exits. All three must be present; do not ship the screen with only Save and Back or a discarding user is trapped.

### 1.4 Confidence band

`SummaryScreen` shows `Confiança {Math.round(confidence * 100)}%` as plain text (App.tsx:1924). Add the threshold band from the plan's Commit 9:

- `>= 0.6` → `#1F7A4C` on `#E8F5EE`, label `Percurso fiável`
- `0.3 – 0.6` → `#8A5A00` on `#FFF4E0`, label `Percurso parcial`
- `< 0.3` → `#A33E22` on `#FDECE8`, label `Poucos dados`

Reuse the `preferencePill` shape (App.tsx:4167) so no new layout primitive is introduced.

---

## 2. "Mark as missing" does not exist

`ListStatus` includes `"missing"`, `isListStatus` validates it, `isPickEventLike` accepts it, and `buildNextShoppingList` keeps missing items on the next list. **No button anywhere sets it.**

Note the correction to the earlier draft of this brief: in the cart, the pick row (App.tsx:1878–1899) offers *only* `Apanhado` plus the two reorder arrows and the drag handle. `Adiar` is on the List screen (App.tsx:1330), not in the cart. So in-store the user has exactly one status action, and no way to say a product was not on the shelf — which is the single most common thing that happens during a real shop.

### The fix

Add a third action to the pick row calling `updateItemStatus(item.id, "missing")`. `updateItemStatus` (App.tsx:538) already handles the status, records the pick event, and — correctly — does not stamp `lastPickedAt` for non-picked statuses.

- Copy: **`Falta`**.
- Style: same footprint as `pickedSmallButton` (App.tsx:4390) but outlined, not filled — border `#A33E22`, text `#A33E22`, white background. Secondary, per V1 §6 ("Missing and skip actions are easy but secondary").
- It must be undoable by the existing `Desfazer última ação` (App.tsx:1793, 1819) — it is, because `updateItemStatus` sets `lastChange` for every status.

`inferSectionRoute` filters to `action === "picked"` (`src/domain/routeInference.ts:17`), so missing items correctly do not pollute the learned route. No change needed there.

**Out of scope:** the Missing Products review screen (V1 §9). That is Commit 10. This commit only makes the status reachable.

---

## 3. Touch targets below 44 pt

`sortButton` (App.tsx:3878) is `width: 32, minHeight: 34`. In the cart, `cartSortButton` (App.tsx:4387) widens it to 40 but leaves the height at 34. These are the reorder arrows — the control used one-handed, while pushing a trolley, in a shop. They are the smallest interactive element in the app and they violate the V1 Interaction Rules ("No primary action should require precision tapping").

### The fix

```
sortButton:        width: 48, minHeight: 48   (App.tsx:3878)
cartSortButton:    width: 48                  (App.tsx:4387 — drop the 40 override)
pickArrowRow:      width: 102                 (App.tsx:4381 — 48 + 6 gap + 48)
pickRowActions:    width: 102                 (App.tsx:4374 — was 86)
pickedSmallButton: width: 102, minHeight: 48  (App.tsx:4390 — was 86 / 46)
```

Also raise, same rationale, lower priority:

- `catalogSmallAction` (App.tsx:3981): `minHeight: 32` → `44`. This is `Editar` / `Apagar`.
- `listPostponeAction` (App.tsx:3853): `minHeight: 36` → `44`. This is `Adiar`.
- `inlineSkipButton` (App.tsx:3847): `minHeight: 36` → `44`.

The route-editor rows reuse `sortButton`, so they inherit the fix for free.

**Check the compact layout after this.** The pick row grows 16 pt wider; verify on a 360 pt-wide viewport that `pickRowInfo` does not collapse product names to one character per line. If it does, drop the drag handle's `minWidth` rather than shrinking the buttons back.

---

## 4. Destructive actions with no confirmation

There are **zero** `Alert.*` calls in the codebase. Two destructive paths run instantly:

- `Apagar` on a catalog card (App.tsx:1628–1629) → `deleteCatalogProduct` (App.tsx:532) removes the product, its list item, and its entire pick history.
- `A pagar!` (App.tsx:1795 compact, 1821 wide) → ends the trip. It sits inside `cartTopActions` (App.tsx:1787, 1813) directly beside `Desfazer última ação`, both `flex: 1`, so a mis-tap ends the shop.

V1 Interaction Rules: *"Destructive actions need confirmation or undo."*

### Use an inline two-step confirm, not `Alert.alert`

`Alert` is poorly supported by `react-native-web` 0.21, and the web build is part of the smoke-test gate. A native-only confirm would make the three platforms behave differently at exactly the moment the user is being asked to be careful.

Implement a small local pattern instead — a `pendingConfirmId` state on the screen, and the button swapping to a confirm/cancel pair for ~4 seconds:

```
[ Apagar ]  →  tap  →  [ Confirmar ] [ ✕ ]  →  4s timeout reverts
```

- **`Apagar`**: confirm before `onDeleteProduct`. Confirm copy `Apagar mesmo`.
- **`A pagar!`**: confirm before `onLockCheckout`. Confirm copy `Terminar compra`. Both call sites (1795 and 1821) need it — they are the compact and wide layouts of the same action.

Clear the pending timer on unmount. One `useRef` timeout per screen is enough; do not add a dependency for this.

**Do not** add a confirm to `Adiar` or `Falta` — both are undoable via `Desfazer`, and V1 says "confirmation **or** undo".

---

## 5. Welcome copy is missing diacritics — now a locale-file fix

The original brief pointed at `WelcomeScreen` inside `App.tsx`. Commit 4 extracted that screen to `app/(auth)/welcome.tsx` and moved its copy into the locale catalogue — **carrying the defect across verbatim**. The strings are now in `src/i18n/locales/pt-PT/welcome.json`:

| Key | Current | Correct |
|---|---|---|
| `headline` | `Compras sem voltas desnecessarias` | `Compras sem voltas desnecessárias` |
| `steps.add.body` | `Produtos que ja estao na Lista desaparecem…` | `Produtos que já estão na Lista desaparecem…` |

Re-read the whole file for others; those two are the ones found, not necessarily all of them. Leave the sentence structure alone — only the accents. Do not touch `en/welcome.json`.

This is the one place where this commit legitimately edits a file outside `App.tsx`. Note the general lesson for Commits 6–8: **an extraction is not a good moment to preserve a defect faithfully.** If a string is wrong, fix it as it moves.

---

## 6. Explicitly out of scope

- **The W4 Shopping Mode rewrite.** No full-row tap-to-pick, no moving the bottom actions, no haptics, no section dividers, no swipe actions. §3 raises the touch targets and stops there.
- **Accessibility labels.** The review found zero `accessibilityRole` / `accessibilityLabel` in the monolith. Fixing that file-wide belongs with the extraction (Pass 1 DoD item 5), where each screen gets labelled as it moves. Adding them here means writing them twice.
- **`FlatList` migration.** Now scheduled with Commit 8 (Add).
- **The hidden row-tap that toggles `acceptsAlternatives`** (App.tsx:596, surfaced at 1308–1309). Already assigned to Commit 6. Leave it.
- **Anything under `src/state/` or `app/`**, except `src/i18n/locales/pt-PT/welcome.json` per §5.

---

## 7. Verification

Manual, on all three platforms. Record in the execution log:

1. **Trip with picks → summary appears.** Add 3 products from different sections, start the cart, mark all 3 `Apanhado`, press `A pagar!`, confirm. Summary must appear with a route and a confidence band.
2. **`Guardar percurso` persists.** Save, then start a new trip at the same store with products from the same sections. The cart order must match the saved route. Confirm `storeItineraries[selectedStoreId]` changed and `itinerary` did not.
3. **`Terminar sem guardar` finalizes.** The next list must be rebuilt correctly and the store route must be unchanged.
4. **Trip with no picks skips the summary.** Start a cart, press `A pagar!`, confirm → straight to List, as today.
5. **`Falta` round-trip.** Mark one item `Falta`, finish the trip, confirm it is still on the next list. Then mark one `Falta` and press `Desfazer` — it must return to `needed`.
6. **Confirms.** `Apagar` and `A pagar!` both require two taps; both revert after the timeout; both work identically on web.
7. **Touch targets.** Screenshot the cart row on a 360 pt viewport with the arrows measurable.
8. **Welcome copy.** `/welcome` renders both corrected strings with accents on web and native; `npm run i18n:check` still passes.
9. **Gates.** `npm run typecheck`, `npm run i18n:check`, `npx expo export --platform web`.

---

## 8. Definition of done

1. Finishing a trip that recorded picks shows the Summary; saving writes the per-store route; discarding does not.
2. `SummaryScreen` has three exits and a confidence band.
3. `Falta` is reachable on every cart row and is undoable.
4. No interactive element in the cart or on a catalog card is below 44 pt.
5. `Apagar` and `A pagar!` are two-step on iOS, Android and web.
6. `pt-PT/welcome.json` is correct Portuguese.
7. No file outside `App.tsx` and `src/i18n/locales/pt-PT/welcome.json` is modified.
