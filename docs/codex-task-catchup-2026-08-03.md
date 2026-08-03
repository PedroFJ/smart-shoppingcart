# Codex Task — Catch-up sync, 2026-08-03

**Nature:** documentation sync plus one encoding repair. **Zero application code changes.** No file under `App.tsx`, `app/`, `src/` or `supabase/` is touched in this task.

**Supersedes:** `docs/codex-task-b1-b3.md`. That task described the OneDrive→GitHub move, which you completed on 2026-05-18. Do not run it.

Read this whole file before running anything.

---

## 1. What happened

Two copies of this repository diverged.

| | OneDrive copy | Dev clone (`C:\Users\PedroFreire\dev\smart-shoppingcart`) |
|---|---|---|
| Last commit | `e9394b9` (docs only) | `3a63eb2` (Pass 1 commit 5) |
| Has the 2026-08-03 review + briefs | yes | **no** |
| Has Commits 4 and 5 | no | yes |

On 2026-08-03 a review was written into the OneDrive copy and committed there. It was never pushed. You had already moved to the dev clone and — correctly, given what you could see — carried on with Commit 4 and Commit 5.

Neither side did anything wrong. The result is simply that the review's two remediation commits were skipped, and the plan document now exists in two versions.

The merge has been done for you. Your job is to bring five files across and commit them.

---

## 2. Pre-flight

Run from the dev clone.

```
pwd                         # must be C:\Users\PedroFreire\dev\smart-shoppingcart
git log --oneline -1        # must be 3a63eb2
git fetch && git status -sb # must be up to date with origin/master
git status --short          # see the rule below — a pristine tree is NOT required
```

If `HEAD` is anything other than `3a63eb2`, stop and report — the merged plan document was built against that commit and its execution log ends there.

**Working-tree rule (revised 2026-08-03, after Codex correctly refused to start).** The first version of this task demanded a clean `git status`. That was too strict and it blocked the sync over untracked documentation, which is not a hazard. The rule that matters is narrower:

- **No modified tracked files under `App.tsx`, `app/`, `src/` or `supabase/`.** If there are, stop — something is half-finished and this task must not commit on top of it.
- **Untracked or modified files under `docs/` are fine.** Resolve them with §2.1 first, then continue.

### 2.1 Clear the untracked docs first, as a separate commit

Do this **before** §3, and commit it on its own. Do not let these files ride along in the sync commit — a docs-sync commit that also carries a hand-written brief is not revertible as one thing.

| File(s) | Action |
|---|---|
| `codex-changelog-validation-*.md` | **Commit.** Two siblings from 2026-05-18 are already tracked on `origin/master`, so leaving the rest untracked is just an inconsistency that will block every future preflight. |
| `docs/ux-decisions.md` | **Commit as-is.** Do not edit it, do not fold it into anything. See §2.2. |
| `docs/commit-6-list-brief.md` | **Commit, with the deferred banner in §2.3 prepended.** The work is not wasted — it is parked behind 5.5 and 5.6. |
| `docs/commit-6-list-brief.draft.md` | **Delete.** See §2.4. |

```
git add docs/codex-changelog-validation-*.md docs/ux-decisions.md docs/commit-6-list-brief.md
git rm --cached -q docs/commit-6-list-brief.draft.md 2>NUL
del docs\commit-6-list-brief.draft.md
git status --short
git commit -m "Track pending validation logs, UX decisions, and the Commit 6 brief"
git push
```

Push this one before starting §3. It gets `ux-decisions.md` onto `origin/master` where it can be read.

### 2.2 Why `ux-decisions.md` is committed unreviewed

Nobody outside your clone has seen this file. It was not part of the 2026-08-03 review, and the Commit 5.6 brief was written without it.

That is a real gap: 5.6 makes five UX decisions — summary-screen exits, the `Falta` action, 48 pt touch targets, two-step confirms, the Welcome accents — and if `ux-decisions.md` already settled any of them differently, 5.6 is wrong on that point. Pushing it is how it becomes reviewable.

**In your execution-log entry for this task, state whether `ux-decisions.md` contradicts anything in `docs/commit-5.6-ux-fixes-brief.md`.** If it does, say which item and stop before starting 5.6. If it does not, say so explicitly and carry on. Do not silently reconcile the two.

### 2.3 Banner for `commit-6-list-brief.md`

Prepend verbatim, then commit:

```
> **DEFERRED 2026-08-03 — do not execute yet.** Commit 6 is no longer the next
> commit. `docs/commit-5.5-persistence-brief.md` and
> `docs/commit-5.6-ux-fixes-brief.md` come first, and both change the tree this
> brief assumes: 5.5 rewrites `src/state/persistence.ts` and the store
> initialisers, 5.6 shifts every line number in `App.tsx`. Re-anchor this brief
> against `HEAD` after 5.6 lands, then execute it.
```

### 2.4 Why the draft is deleted rather than kept

`commit-6-list-brief.draft.md` sits beside a finished `commit-6-list-brief.md` with a nearly identical name. Two versions of the same brief in one directory is precisely the failure this whole catch-up exists to repair — the 3.5 and 5.5 briefs are the same document one iteration apart, and the entire risk was that the wrong one gets executed.

If the final is complete, the draft has no readers. Delete it.

If the final is **not** complete — if the draft holds reasoning that never made it across — then merge the draft's content into the final *first*, commit the final alone, and delete the draft after. Do not commit both.

---

## 3. Copy these five files from the OneDrive copy

Source: `C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart\docs\`
Destination: `C:\Users\PedroFreire\dev\smart-shoppingcart\docs\`

| File | Status |
|---|---|
| `pass1-split-and-i18n-plan.md` | **overwrites** the tracked copy — this is the merge |
| `project-review-2026-08-03.md` | new |
| `commit-5.5-persistence-brief.md` | new |
| `commit-5.6-ux-fixes-brief.md` | new |
| `codex-task-catchup-2026-08-03.md` | new — this file |

**Do not copy** `commit-3.5-persistence-brief.md`, `commit-3.6-ux-fixes-brief.md`, `codex-task-b1-b3.md`, or `move-to-github-brief.md`. All four describe a starting state that no longer exists. They stay in the OneDrive archive.

### 3.1 Copy them as bytes, not as text

```powershell
$src = "C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart\docs"
$dst = "C:\Users\PedroFreire\dev\smart-shoppingcart\docs"
foreach ($f in @(
  "pass1-split-and-i18n-plan.md",
  "project-review-2026-08-03.md",
  "commit-5.5-persistence-brief.md",
  "commit-5.6-ux-fixes-brief.md",
  "codex-task-catchup-2026-08-03.md"
)) { Copy-Item -LiteralPath "$src\$f" -Destination "$dst\$f" -Force }
```

Use `Copy-Item`. Do **not** read these files into a variable and write them back out with `Out-File`, `Set-Content`, or `>` — that is almost certainly how the corruption in §4 happened.

---

## 4. The encoding repair, and the trap that caused it

`docs/pass1-split-and-i18n-plan.md` on `origin/master` is corrupted:

- it carries a UTF-8 BOM, which it did not have at `6cabb08`;
- every non-ASCII character is double-encoded — `—` is stored as `â€"`, `Confiança` as `ConfianÃ§a`, `≥` as `â‰¥`.

The pattern is UTF-8 bytes read as cp1252 and re-encoded as UTF-8. In PowerShell 5.1 that is the default behaviour of `Get-Content` + `Out-File`/`>` on a UTF-8 file, and `Out-File` adds the BOM. No other document on `origin/master` is affected, so this is a one-file accident, not a repo setting.

The copy in §3 fixes it: the merged file has been repaired to clean UTF-8, no BOM, LF line endings.

**Verify after copying**, from the dev clone:

```powershell
# 1. No BOM: the first three bytes must be 23 20 50  ("# P"), not EF BB BF
Format-Hex -Path docs\pass1-split-and-i18n-plan.md -Count 8

# 2. No mojibake: both counts must be 0
(Select-String -Path docs\pass1-split-and-i18n-plan.md -Pattern 'â€' -AllMatches).Count
(Select-String -Path docs\pass1-split-and-i18n-plan.md -Pattern 'Ã'  -AllMatches).Count

# 3. Portuguese renders: this must print with a cedilla
Select-String -Path docs\pass1-split-and-i18n-plan.md -Pattern 'Confiança'
```

If any check fails, the copy step re-encoded the file. Delete it and copy again with `Copy-Item`.

**For every future write to a Markdown file in this repo:** UTF-8 **without** BOM. In PowerShell that means `Set-Content -Encoding utf8NoBOM` (PS7) or `[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))` (PS5.1). `.gitattributes` normalizes line endings but cannot fix an encoding that was wrong before the file reached git.

---

## 5. Commit

One commit, docs only. **Add the five files by name.** Do not run `git add docs/` — the first version of this task said to, which would have swept the untracked files from §2.1 into the sync commit.

```
git add docs/pass1-split-and-i18n-plan.md ^
        docs/project-review-2026-08-03.md ^
        docs/commit-5.5-persistence-brief.md ^
        docs/commit-5.6-ux-fixes-brief.md ^
        docs/codex-task-catchup-2026-08-03.md
git status --short     # staged must be exactly: M pass1-split-and-i18n-plan.md + 4 new files
git commit -m "Sync 2026-08-03 review, Commit 5.5/5.6 briefs, and plan merge"
git push
```

If `git status --short` shows anything staged beyond those five, unstage it and re-add by name.

Sanity-check the diff on the plan document before committing. It should show:

- the whole file re-encoded (expect a large apparent diff on non-ASCII lines — that is the repair);
- a revision note after the "After commit 3" paragraph;
- two new sections, Commit 5.5 and Commit 5.6, before Commit 6;
- Commits 7 and 8 swapped so Shop precedes Add;
- one struck bullet in §4, three new risk bullets and a new §6.1 in §6;
- one new execution-log entry at the end, signed by Claude;
- **your Commit 4 and Commit 5 log entries intact and unchanged.** If they are missing, stop — you have the wrong file.

The eight hourly "Automation check" entries from the OneDrive copy are deliberately not included. They record the move blocker you have already resolved.

---

## 6. Then start Commit 5.5

`docs/commit-5.5-persistence-brief.md`. In short: restore `zustand/middleware`'s `persist`, replace the one-shot legacy-import flag with a `savedAt` watermark, and move `listSearch` / `addSearch` / `departmentFilter` out of the synced blob.

**Do not start Commit 6 first.** Settings is a live consumer of the stores and the stores hold an eleven-week-old snapshot; every screen extracted before 5.5 lands widens the blast radius.

Two things in that brief are questions for you rather than instructions, and both deserve an explicit answer in your execution-log entry:

1. **Why was `zustand/middleware`'s `persist` replaced with a local implementation** during Commit 4 or 5, when `zustand@^5.0.13` was declared and installed? If it was a typing error against v5, say what the error was. If the real middleware still will not typecheck after you try, stop and flag it rather than restoring the shim.
2. **Were any store `name` keys changed** when the shim was introduced? If so, devices have already lost that store's data, and §5.1 of the brief needs to account for it.

---

## 7. Definition of done for this task

1. The untracked docs are resolved per §2.1 and pushed as their own commit, before the sync commit. `commit-6-list-brief.md` carries the deferred banner; the `.draft.md` is gone.
2. The five files in §3 exist in the dev clone; the four superseded ones were not copied.
3. All three encoding checks in §4 pass.
4. The sync commit stages exactly five paths, added by name, and is pushed.
5. Your Commit 4 and Commit 5 execution-log entries are still present in the merged plan.
6. An execution-log entry is appended recording both commits, stating whether `ux-decisions.md` contradicts the Commit 5.6 brief (§2.2), and answering the two questions in §6.
