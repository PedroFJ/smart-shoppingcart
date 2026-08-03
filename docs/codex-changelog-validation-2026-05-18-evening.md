# Codex Changelog Validation - 2026-05-18 (Evening run)

Automated validation run by Claude (Cowork). Pedro was not present.

## TL;DR

Codex landed **Commit 5 (Settings)** at `2026-05-18 22:35 +0100`, six minutes
before this validation run started. The changelog entry, the on-disk reality on
`HEAD = 3a63eb2` and `origin/master` all agree. No roadblocks. The next planned
step per the build plan is **Commit 6 — extract List**, and no
`docs/commit-6-list-brief.md` is pre-staged yet, so Codex is currently
waiting on Pedro for the brief (consistent with the established pre-staging
pattern used for Commits 3, 4 and 5).

## Latest Codex changelog entry

`docs/pass1-split-and-i18n-plan.md` §8, dated `2026-05-18 22:33 Europe/Lisbon`,
"Pass 1 commit 5 (Settings)". Codex signs off with:

> Next recommended step: Commit 6 - extract List
> (`(app)/(tabs)/list.tsx`). This is also where the deliberate UX-issue-5 fix
> lands: replace the hidden row-tap-toggles-alternatives behavior with a
> labelled switch on the row.

That matches the plan's §3 Commit 6 spec exactly.

## Validation results

### Repo state

- `HEAD` = `3a63eb2` = `Pass 1 commit 5: extract Settings to
  (app)/settings/index.tsx`.
- `origin/master` = `3a63eb2`. In sync (`0 0` ahead/behind after `git fetch`).
- Working tree on Windows is presumed clean; see the Sandbox-mount caveat
  below for why this sandbox view shows a noisy `git status` that is not
  representative of the real repo.

### Commit 5 on-disk vs Codex's claims (all verified against `HEAD`'s tree)

| Codex claim | Verified |
|---|---|
| `app/(app)/_layout.tsx` exists | yes (`app/(app)/_layout.tsx` blob `02d4bb06`) |
| `app/(app)/settings/_layout.tsx` with localized header | yes (blob `8830d35a`, 265 B working copy) |
| `app/(app)/settings/index.tsx` with seven panels | yes (blob `c9ddb3e2`, 11 056 B working copy) |
| Four stub sub-routes (`products`, `stores`, `household`, `account`) | yes — all four files present in `HEAD`'s tree, each ~625 B, each renders `t("stub.emBreve")` |
| `App.tsx` `screen === "settings"` branch replaced with `<Redirect href="/settings" />` | yes — line 889 in both `HEAD` and working tree |
| `function SettingsScreen` removed from `App.tsx` | yes — no match in `HEAD:App.tsx` |
| `App.tsx` shrank ~10 KB | yes — `git show HEAD~1:App.tsx \| wc -c` = 142 687 B, `git show HEAD:App.tsx \| wc -c` = 132 697 B (LF blob bytes). Δ = −9 990 B, consistent with the SettingsScreen function + its styles being deleted. Line count dropped 4 772 → 4 458 (−314 lines). |
| `useSyncStore.commitSyncSpaceDraft()` added | yes — type at `src/state/syncStore.ts:17`, implementation at `:46` |
| `src/i18n/locales/pt-PT/settings.json` populated | yes — blob `4b0cb4f3` (full localized content: `headerTitle`, `arranque`, `user`, `account`, `family`, `defaultStore`, `voice`, `stub.emBreve`, etc.) |
| `src/i18n/locales/en/settings.json` populated | yes — blob `ce286d92` |
| Other locale namespaces left untouched | yes — all other `*.json` files under `src/i18n/locales/` still resolve to the empty `0967ef42…` "{}" blob |
| `docs/commit-5-settings-brief.md` included in the commit | yes — blob `43f0a6e2` |

### Baseline checks

Codex's own Commit 5 changelog entry reports:

- `npm run typecheck` — passed.
- `npm run i18n:check` — passed in warning mode, no plain JSX text nodes
  found.
- `npx expo export --platform web --clear --output-dir dist-router-smoke` —
  passed; temp export folder deleted.
- Headless Edge smoke against the exported web build — passed (seven items:
  Settings reachable; SmartStart and Voice toggles persist; user name
  persists; default store persists; sync space draft normalized and
  committed; all four stub sub-routes reachable; Welcome path still works
  after `localStorage` clear).

**I deliberately did not re-run `typecheck` / `i18n:check` from this sandbox
session.** Reason: see the Sandbox-mount caveat — the `src/i18n/locales/
en|pt-PT/settings.json` files in the sandbox view are stale (3-byte `{}`
left over from before Commit 5) even though `HEAD` and the real Windows
checkout have the full content. Running the checks against the stale
sandbox view would have produced false negatives. Codex ran the same
commands inside its own Windows shell on the actual post-commit working
tree, which is the source-of-truth environment.

### Sandbox-mount caveat (not a Codex problem)

This Cowork sandbox sees the Windows + OneDrive working tree through a
Linux mount, and that mount has gone stale in two visible ways that
travelers should ignore:

1. `git status` reports phantom renames (`productsStore.ts → productsStor`,
   note the truncated extension) and many "deleted + untracked" pairs for
   files under `src/state/`, `supabase/migrations/`, and `tsconfig.json`.
   `git ls-files` only returns 79 entries with junk paths like `./`,
   while `git ls-tree -r HEAD` returns the real 79-entry tree with the
   correct paths. The on-disk Windows working tree is fine; the sandbox's
   `.git/index` view is just inconsistent.
2. `src/i18n/locales/en/settings.json` and `pt-PT/settings.json` in the
   sandbox view have a mtime of `2026-05-17 23:32` (before Commit 5) and
   contain the empty `{}` placeholder; `HEAD`'s tree has the real
   localized JSON.

The previous PM validation already noted similar Windows + OneDrive
behaviour around `.git/index.lock`. I left `.git/index` alone — touching
it from the sandbox risks corrupting Pedro's real Windows repo.

## Roadblocks

**None blocking this validation.** Commit 5 is real, matches the
changelog, builds cleanly per Codex's own checks, and is already pushed to
`origin/master`.

## Next step for Codex

Per the plan's §3 Commit 6 spec and Codex's own sign-off: **extract List
to `app/(app)/(tabs)/list.tsx`**, bring `shoppingListStore` and
`productsStore` online as real consumers, and **replace** the hidden
row-tap-toggles-alternatives behaviour (`App.tsx:1523`) with a labelled
switch on the row — this is the UX-issue-5 fix from the synthesis, the
first deliberate UX *change* in Pass 1 (not just a refactor).

**Open question — pre-staged brief.** Commits 3, 4 and 5 each shipped with
a Pedro-authored `docs/commit-N-*-brief.md` (~10–13 KB each) that Codex
followed verbatim. No `docs/commit-6-list-brief.md` exists in either the
working tree or `HEAD` as of this run. Two ways forward:

- **Preferred** (matches the established pattern): Pedro pre-stages
  `docs/commit-6-list-brief.md`, then Codex executes. The brief needs to
  pin down the UX-issue-5 visual treatment (switch label copy in pt-PT
  and en, accessibility hints, where on the row, how it interacts with
  the existing "alternativas" affordance) since that's a real product
  decision, not just a mechanical extraction.
- **Fallback**: Codex executes Commit 6 directly from the plan's §3
  paragraph plus the existing per-row code at `App.tsx:1523`. Riskier
  because the UX copy and switch placement are not specified there.

This is not a "stop and notify" roadblock — it's the normal cycle handoff
between validations: Codex just finished, Pedro picks up the next brief
when he's back. Flagging it here so the next validation run (or Pedro)
knows the queue is empty.

## Side notes (low priority)

- Codex's Commit 5 changelog entry says "Saltar Início" and "Pesquisa por
  voz" toggles persist — both confirmed against `pt-PT/settings.json`
  keys `arranque.smartStart.label` and `voice.label`.
- The plan's §3 already calls out a one-line bonus fix during Commit 6 for
  the "11-sections-vs-10-section-card-styles" mismatch (`sampleData.ts`
  vs `App.tsx:3395-3450`). Worth mentioning in the Commit 6 brief so it
  isn't forgotten.
- The Commit 5 brief had three minor inaccuracies flagged by the morning
  validation (line numbers off by ~16 lines, one `pnpm` typo). Codex
  handled them gracefully — no action needed.

---

Signed-off-by: Claude (Cowork scheduled validation run, 2026-05-18 ~22:42
Europe/Lisbon)
