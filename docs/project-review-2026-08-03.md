# Project Review — 2026-08-03

Reviewer: Claude (planning/validation). Implementer: Codex.
Scope reviewed: `App.tsx`, `app/`, `src/`, `supabase/`, `docs/`, git history.

---

> **Read this first — status banner added on re-issue, 2026-08-03.**
>
> This review was written against `6cabb08` in the OneDrive working copy and was never pushed. Codex, working from `C:\Users\PedroFreire\dev\smart-shoppingcart`, has since shipped **Commit 4 (Welcome)** and **Commit 5 (Settings)** without it. `origin/master` is now `3a63eb2`.
>
> What that changes in this document:
>
> - **§0 is history, not a to-do.** The non-OneDrive move described as incomplete was completed by Codex on 2026-05-18. The dev clone exists and is the working copy. No action remains.
> - **§2 is unchanged in substance and more urgent in practice.** Commits 4 and 5 shipped Welcome and Settings as live consumers of the stale stores, so §2.1 is now reachable in the shipped build rather than latent. Two further findings were added on re-issue: `zustand/middleware`'s `persist` was replaced by a local reimplementation, and `docs/pass1-split-and-i18n-plan.md` had its character encoding corrupted (both now covered in the plan and in the Commit 5.5 brief).
> - **§3 is unchanged**, except that the Welcome diacritics fix has moved from `App.tsx` into `src/i18n/locales/pt-PT/welcome.json`, where Commit 4 carried the defect verbatim.
> - **Commits 3.5 and 3.6 are renumbered 5.5 and 5.6** and now sit between Commit 5 and Commit 6. Execute `docs/commit-5.5-persistence-brief.md` and `docs/commit-5.6-ux-fixes-brief.md`; the 3.5 and 3.6 briefs are superseded and must not be run.
>
> The analysis below is left as written. Only this banner was added.

---

## Conclusion

**Do not resume Pass 1 at Commit 4. Insert a Commit 3.5 first.** The scaffolding
landed in May is now a *stale parallel copy* of the app, and the legacy-import
flag has already been burned. Extracting a screen today would ship a household
their May list. Fix that, then continue the extraction — but reorder the
remaining commits so **Shop comes before Add**, because the only unreachable
feature in the product is the one that justifies the product.

---

## 0. Why it actually stalled — and it is a ten-minute fix

**Addendum, after reading the full execution log.** The project did not stall for
lack of a plan. It stalled on an unfinished manual step, and then an hourly
automation spent the next months re-reporting the same blocker.

The sequence:

1. 2026-05-17 — OneDrive corrupted the working tree twice. Pedro chose Option A:
   move to GitHub, run from a non-OneDrive path. `docs/move-to-github-brief.md`
   was written.
2. Codex executed §1–§4 of that brief. **The push succeeded.** Verified today:
   `origin` → `https://github.com/PedroFJ/smart-shoppingcart`,
   `origin/master == HEAD == 6cabb08`. The history is safe on GitHub.
3. §5–§7 of the brief are **Pedro actions**: clone into
   `C:\Users\PedroFreire\dev\smart-shoppingcart`, re-point Cowork, archive the
   OneDrive copy. They were never done.
4. Codex — correctly — refused to start Commit 4 from a folder it had just
   declared untrustworthy.
5. The hourly `codex-changelog-validation` task then appended eight
   *"no newer task detected · Commit 4 remains blocked"* entries between
   2026-05-18 01:00 and 11:01, and stopped.

This session is reading the repo from
`C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart` — so §5–§7 are still
outstanding as of today.

**The single highest-value action in this document is Pedro running §5–§7 of
`docs/move-to-github-brief.md`.** Nothing else in Pass 1 should start first, and
everything else in this review is downstream of it. The commands are already
written; they take about ten minutes.

**Secondary observation.** `docs/pass1-split-and-i18n-plan.md` is now 743 lines /
47 KB, and the majority of it is an execution log in which eight consecutive
entries say the same thing. A plan document that has to be scrolled past its own
changelog stops being read. Move §8 into `docs/execution-log.md` and keep the
plan at the plan.

---

## 1. State of play

| Item | Reality |
|---|---|
| Pass 1 progress | Commit 3 of 11. Last code commit `06eb964`, 2026-05-17 — stalled ~2.5 months. |
| `App.tsx` | 4861 lines. Owns 100% of the UI, 100% of state, 100% of strings. |
| `src/state/*` (8 stores) | Created, persisted, hydrated on boot — **read by zero components**. |
| `src/i18n` (12 namespaces × 2 locales) | Wired via `<I18nextProvider>` — **zero `useTranslation` calls in the app**. |
| `expo-router` | Alive, but `app/index.tsx` is a one-line re-export of the monolith. |
| Working tree | Clean against `HEAD`. Repo still inside OneDrive (known brittleness). |

The infrastructure is real and correct in isolation. It is also 100% dead weight
today, and dead weight decays — see §2.1.

---

## 2. Critical bugs (fix before any further extraction)

### 2.1 Legacy-import flag is burned while the stores are still unused — data loss on Commit 4

`app/_layout.tsx` calls `bootstrapLegacyState()` at module scope. On the first
launch of the Commit-3 build it reads `smart-shoppingcart:v1`, hydrates all eight
stores, persists them, and calls `markLegacyStateImported()`.

From that moment:

- `App.tsx` keeps writing the live list to `smart-shoppingcart:v1`.
- The zustand stores hold a **frozen snapshot from that first launch** and never
  re-import, because `shouldImportLegacyState()` now returns `false` forever.

The staging build has been on family phones since May. The store snapshots are
~2.5 months stale. The first screen that reads a store (Commit 4 onward) will
render that stale state and then persist it back over the live data.

**Fix (Commit 3.5):** make the import idempotent instead of one-shot. Replace the
boolean flag with a `savedAt` watermark — re-import whenever
`legacyState.savedAt > storesLastImportedAt`. Keep `markLegacyStateImported()`
only as the final cutover switch, flipped in Commit 11 when `App.tsx` dies.

Verification: install the current staging build, add a product, force-quit,
relaunch, confirm the store snapshot matches the live list.

### 2.2 Supabase RLS is fully open

`supabase/migrations/20260515090000_app_state_snapshots.sql`:

```sql
create policy "..." on public.app_state_snapshots for all
using (true) with check (true);
```

The anon key ships in the client bundle. The row id is a guessable slug
(`pedro-family`). Anyone with the bundle can read or overwrite any household's
entire app state. Acceptable for a solo prototype; **not acceptable the moment a
second household joins the private beta**, and the plan puts private beta right
after Pass 1.

**Fix:** gate the beta on Supabase Auth (W5) landing first, or — as an interim —
move the space id to a high-entropy secret and add a `using (id = current_setting(...))`
policy. Do not open the beta on `using (true)`.

### 2.3 Search text is synchronised across the family

`listSearch` and `addSearch` are fields of `PersistedAppState` and sit in the
persistence effect's dependency array (App.tsx:340–356). Consequences:

- Every keystroke in a search box schedules a 600 ms-debounced **remote write of
  the entire app state blob**.
- Every keystroke broadcasts over Realtime and **overwrites the other family
  member's search box mid-typing**.

The same applies to `departmentFilter`. These are per-device view state, not
household state.

**Fix:** move `listSearch`, `addSearch`, `departmentFilter` out of the synced
blob into `LocalUserSettings` (device-local). One-line win, removes the worst
sync-thrash path.

### 2.4 Last-write-wins on a single JSONB row

The whole app state is one row, replaced wholesale, resolved by `savedAt`
comparison. The V1 spec explicitly requires: *"Family members can keep adding
products while another user is picking in-store."* Under this model, the picker's
device and the adder's device overwrite each other; whoever saves last wins and
the other's additions vanish silently.

This is a known prototype shortcut, not a regression — but it is a **beta
blocker**, and it is the reason the relational schema in
`docs/supabase-v1-schema.sql` exists. Flag it as W7 and schedule it before the
private beta, not after.

---

## 3. UX/UI — ranked

### 3.1 The product's differentiator has no UI (highest impact)

`SummaryScreen` is **dead code**. `setScreen("summary")` is never called anywhere
in 4861 lines. Therefore `saveInferredRoute()` never runs, `inferSectionRoute()`
output is never shown, and `pickEvents` accumulate forever and are cleared
without ever being used.

Route learning currently happens *only* as an implicit side effect of manually
dragging cart cards (`updateSelectedStoreRouteFromProductOrder`). The user is
doing the learning; the app is taking the credit.

The V1 acceptance criteria say *"The app proposes a route after the trip"* and
*"The route can be adjusted and reused."* Neither is reachable.

**Fix:** route `finishShoppingTrip()` through the summary when
`pickEvents.length > 0` — show the inferred route, let the user save or discard,
*then* rebuild the next list. This is a ~30-line change inside the monolith and
does not need to wait for the extraction.

### 3.2 "Mark as missing" does not exist

`ListStatus` has `"missing"`, the persistence layer validates it, the next-list
builder honours it — and no button anywhere sets it. In-store the user has only
*Apanhado* and *Adiar*. The V1 scope lists "Mark product as missing/unavailable"
as included, and screen §9 (Missing Products) as a V1 screen.

**Fix:** add a third action on the pick row now (cheap), defer the Missing
Products review screen to the extraction (Commit 10).

### 3.3 Shopping mode inverts its own spec

The spec (§6 UX rules) asks for big rows, full-row tap to pick, large bottom
actions, and always-visible undo. What ships:

| Spec | Ships |
|---|---|
| Full row tap marks picked | Row tap does nothing; a small right-side button does |
| Large bottom actions | `A pagar!` and `Desfazer` are pinned to the **top** |
| No precision tapping | Reorder arrows are **32 × 34 pt** — below the 44 pt minimum |
| Undo always visible after a pick | Undo is off-thumb on a large phone |
| Destructive needs confirmation | `A pagar!` ends the trip instantly, adjacent to Undo |

`sortButton` at 32×34 is the worst offender: it is the control used one-handed,
while pushing a cart, in a shop. Raise to ≥ 48 pt and move the pick action to a
full-row press with the arrows demoted to a long-press/drag affordance.

**Fix:** this is W4 in the plan and should stay W4 — but pull the two
**one-line** items forward now: bump `sortButton` to 48 pt, and add a confirm
step to `A pagar!`.

### 3.4 Zero accessibility

`grep -c accessibilityRole|accessibilityLabel|accessibilityHint App.tsx` → **0**.
Not one label in the entire app. Department is encoded as a **left border colour
only** — no icon, no text — so the section grouping is invisible to a
screen reader and to a colour-blind user.

Pass 1 DoD item 5 requires role + label on every interactive element. Keep it,
and add a text/icon carrier for the department alongside the colour.

### 3.5 Destructive delete with no confirmation and no undo

`Apagar` on a catalog card calls `deleteCatalogProduct` immediately — removes the
product, its list item, and its pick history. No `Alert`, no undo. There are zero
`Alert.*` calls in the codebase. Directly contradicts V1 Interaction Rules.

### 3.6 Hidden gesture toggles brand preference

Tapping the body of a list card silently flips `acceptsAlternatives`
(App.tsx:1523) — an undiscoverable gesture that changes a purchasing decision.
Already flagged for Commit 6; keep it there but treat it as a **bug**, not a
polish item.

### 3.7 Everything is `ScrollView` + `.map()`

Zero `FlatList` in the codebase. Every product in the catalog and every list item
mounts eagerly. Fine at 60 products; it will not survive a real household
catalog, and the Add screen is the one that grows.

### 3.8 Copy quality

The Welcome screen ships pt-PT without diacritics: *"desnecessarias"*, *"ja
estao"*, *"Produtos que ja estao na Lista"*. In a Portuguese-first product this
reads as unfinished. Fix when the strings move into `welcome.json` (Commit 4).

### 3.9 Resolved — no longer a concern

The plan's §4 note about "11 sections vs 10 section card styles" is **stale**.
`getSectionCardStyle` now covers all 11 section ids. Remove the item from the
plan so Codex doesn't chase it.

---

## 4. Recommended next steps

One path. Ordered.

**Step 0 — Finish the workspace move (Pedro, ~10 minutes, blocks everything)**
0. Run §5–§7 of `docs/move-to-github-brief.md`: clone from GitHub into
   `C:\Users\PedroFreire\dev\smart-shoppingcart`, re-point Cowork at it, archive
   the OneDrive copy. Then commit the two currently-uncommitted doc changes
   (`pass1-split-and-i18n-plan.md`, `move-to-github-brief.md`) from the new clone.
   Everything below runs from the new path.

**Commit 3.5 — Unblock the extraction (~half a session)**
1. Replace the one-shot legacy-import flag with a `savedAt` watermark (§2.1).
2. Move `listSearch`, `addSearch`, `departmentFilter` out of the synced blob (§2.3).
3. Verify on a real staging device carrying a real `smart-shoppingcart:v1` blob.

**Commit 3.6 — In-monolith UX fixes that don't need the split (~one session)**
4. Route `finishShoppingTrip()` through `SummaryScreen` (§3.1).
5. Add the *Falta* (missing) action to the pick row (§3.2).
6. `sortButton` → 48 pt; confirmation on `A pagar!` and on `Apagar` (§3.3, §3.5).
7. Fix the Welcome diacritics (§3.8).

These seven items are all inside `App.tsx`, all reversible, and all ship green.
They also mean that if the extraction stalls again, the app on the family's
phones is materially better than it is today.

**Then resume the plan, with one reordering:** run **Commit 8 (Shop) before
Commit 7 (Add)**. Shop is where the product's value and its worst UX both live;
Add is the safest and least urgent. The plan's current order optimises for
diff-size, which is the wrong objective now that the sequence has already
demonstrated it can stall for ten weeks.

**Before the private beta, not after:** RLS + auth (§2.2) and the move off the
single-JSONB-row sync model (§2.4).

---

## 5. Failure points to watch

- **Commit 3.5 is easy to get wrong quietly.** A bad watermark comparison
  silently re-imports stale state on every launch. Require Codex to show a
  before/after of the persisted blobs on a real device, not a typecheck pass.
- **Codex will want to bundle 3.5 and 3.6.** Reject that. 3.5 touches
  persistence; 3.6 touches UI. If they land together and something breaks, the
  bisect is worthless.
- **The repo is still in OneDrive**, and that is not a background risk — it is
  the live blocker (§0). The tree happens to be clean today, which is exactly
  what makes it tempting to skip the move again.
- **Codex self-blocks silently.** It was right to refuse Commit 4, and it said so
  — eight times, into a changelog nobody was reading. A blocker that needs a
  Pedro action needs to surface somewhere Pedro looks, not in an append-only log.
  Worth deciding where that is before the next handoff stalls the same way.
- **Ten weeks of drift.** `App.tsx` and `src/state/*` have diverged since May.
  Every extraction commit from here has to reconcile two copies of the same
  logic, not just move one. That cost was not in the original estimate.
