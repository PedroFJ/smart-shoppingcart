# Working Tree Recovery — Brief for Codex

**Priority:** blocks all Pass 1 work. Do this *before* Commit 4 (`(auth)/welcome.tsx`).
**Not a feature commit.** This is a repo-hygiene operation. It may or may not produce a git commit; see §5.

---

## 1. What went wrong

Twice in the current session the working tree has gone bad mid-write:

- **Before Commit 3:** `package.json`, `app.json`, `package-lock.json` were left truncated mid-line in the working tree (uncommitted).
- **After Commit 3:** the commit (`06eb964`) is intact in git's object store, but the working tree no longer matches it:
  - `app/_layout.tsx` on disk is 138 bytes ending mid-identifier at `bootstrapLe`; the committed version is the full ~330-byte file.
  - `docs/pass1-split-and-i18n-plan.md` on disk is missing the 50-line Commit-3 log entry that the commit itself contains.
  - `git status` returns `fatal: unknown index entry format 0x49420000` — `.git/index` is corrupted.

**Root cause hypothesis:** the repo lives under `C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart\`. OneDrive's binary file sync is racing with git's index writes and the many-small-files writes Codex performs. The intermittent mid-write truncations and the corrupt index are consistent with a sync agent partially overwriting files git just produced.

Do not try to "salvage" or `git add` the truncated working-tree files. They are not edits — they are corruption. Recovery is by `git checkout`-ing from `HEAD` (commit `06eb964`), which is known-good.

---

## 2. Pre-flight (Pedro action required before Codex starts)

Codex: **pause and ask Pedro to confirm both of these before running any command in §3:**

1. **Pause OneDrive sync** for the `OneDrive\PROJECTS\Smart Shoppingcart` folder, or globally if simpler. Right-click the OneDrive tray icon → "Pause syncing" → 2 hours (or longer). The pause prevents OneDrive from racing the recovery itself.
2. **Close any editor or tool that has files in the repo open** (VS Code, Codex desktop, file explorers showing the folder). Open file handles are exactly what OneDrive interferes with.

When Pedro confirms both, proceed to §3. If Pedro cannot pause OneDrive (e.g. policy-locked), execute §3 anyway but note in the Execution Log that recovery ran without a sync pause — it may need to be repeated.

---

## 3. Recovery steps

Run from the project root in a bash shell (the workspace bash works; PowerShell with `git` on PATH also works — translate `rm` to `del` and slashes accordingly).

### 3.1 Rebuild the corrupt index

```bash
cd "/sessions/festive-stoic-davinci/mnt/Smart Shoppingcart"
rm -f .git/index
git reset --mixed HEAD
```

`git reset --mixed HEAD` rebuilds `.git/index` from the `HEAD` tree without touching the working tree. After this, `git status` must run without the `fatal: unknown index entry format` error. If it still errors, stop and report — something deeper is wrong (corrupt pack, missing object) and a non-destructive escalation is needed.

### 3.2 Restore the working tree from HEAD

```bash
git checkout -- .
```

This overwrites every tracked file in the working tree with its `HEAD` blob. The two truncated files (`app/_layout.tsx`, `docs/pass1-split-and-i18n-plan.md`) and any other quiet corruptions go back to their committed contents.

### 3.3 Verify alignment

Run all of the following and confirm each expectation:

```bash
git status                                 # expect: "nothing to commit, working tree clean"
git log --oneline -5                       # expect: 06eb964 at HEAD
wc -c app/_layout.tsx                      # expect: ~330 (not 138)
tail -3 app/_layout.tsx                    # expect: closing </I18nextProvider> + }
grep -c "2026-05-17 21:53" docs/pass1-split-and-i18n-plan.md
                                           # expect: 1 (the Commit 3 entry is back)
ls src/i18n/locales/en | wc -l             # expect: 12 (twelve namespace JSON files)
ls src/i18n/locales/pt-PT | wc -l          # expect: 12
ls src/i18n/locales/pt-BR                  # expect: .gitkeep
ls src/i18n/locales/es                     # expect: .gitkeep
```

If any expectation fails, stop and report — do not proceed to §4. The repo is the source of truth Commit 4 builds on; we don't continue on a half-restored tree.

### 3.4 Re-validate the toolchain

```bash
npm install                                # lockfile sanity; should be a no-op or near-no-op
npm run typecheck                          # must pass
npm run i18n:check                         # must run, warning-only, exit 0
```

If `npm install` mutates `package-lock.json` more than trivially, stop and report — that suggests the lockfile was also damaged at some point and needs its own decision.

### 3.5 Resume OneDrive (Pedro action)

Tell Pedro the recovery is complete and ask him to **resume OneDrive sync**. Wait long enough (~30 seconds with the network watching) to confirm OneDrive doesn't immediately re-corrupt anything. Re-run §3.3 once more after resume. If the working tree is still clean, recovery succeeded.

---

## 4. Long-term remediation — Pedro decision needed

The recovery in §3 returns the repo to a clean state but **does not stop the corruption from recurring.** As long as the repo lives under OneDrive and Codex writes to it, this will keep happening. Two options; Pedro picks one before Commit 4.

### Option A — Move the repo out of OneDrive (recommended)

Git already provides versioning and remote backup (when pushed). OneDrive sync on top of `.git/` provides no benefit and actively causes corruption. Move the repo to a non-OneDrive path.

Suggested target: `C:\Users\PedroFreire\dev\smart-shoppingcart\` (or any non-OneDrive folder).

Codex should **not** perform the move itself — moving the project root would sever the current working-folder mount mid-session. Instead, Codex should produce a numbered checklist that Pedro runs:

```
1. In the OneDrive tray, pause syncing.
2. Close every editor/tool with the project open, including Codex desktop.
3. In PowerShell:
     mkdir C:\Users\PedroFreire\dev
     robocopy "C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart" `
              "C:\Users\PedroFreire\dev\smart-shoppingcart" /E /COPYALL /R:1 /W:1
4. Verify the new copy:
     cd C:\Users\PedroFreire\dev\smart-shoppingcart
     git status        (must be clean)
     git log --oneline -5  (must show 06eb964 at HEAD)
5. Open Codex desktop, point the working folder to the new path.
6. Once confirmed working, delete the old copy:
     Remove-Item -Recurse -Force "C:\Users\PedroFreire\OneDrive\PROJECTS\Smart Shoppingcart"
7. Resume OneDrive sync.
```

The `node_modules/` directory is large; `robocopy` with `/E` will copy it, which is fine but slow. If Pedro wants it faster, skip `node_modules/` from the copy (add `/XD node_modules`) and run `npm install` once in the new location.

After the move, push the repo to a remote (GitHub) if not already, so OneDrive is no longer doing the backup job.

### Option B — Keep OneDrive, add a session ritual (fallback)

If moving the repo is genuinely not possible, the workflow becomes:

```
Before any Codex session:
  1. Pause OneDrive sync.
  2. Confirm git status is clean.
Run the Codex session.
After the session:
  3. Verify git status is clean.
  4. Resume OneDrive sync.
  5. Wait 30s, re-verify git status is clean.
```

This is brittle (one forgotten pause = corruption). Recommend Option A.

---

## 5. Should this produce a git commit?

- If §3.1–3.3 restored the tree from `HEAD` exactly: **no commit.** The tree already matches `HEAD`; there is nothing to commit. Recovery is invisible in git history, which is the correct outcome.
- If `npm install` produced a meaningful `package-lock.json` change in §3.4: **one tiny commit**, message: `Repair lockfile after working-tree corruption`. Nothing else in the diff.
- If Codex notices any *intentional* edits in the working tree that predate the corruption and were lost in the `git checkout`, **stop immediately** and ask Pedro before retrying. We do not assume there are unsaved edits — the user's workflow is Codex-implements / Claude-plans, so uncommitted work is unusual — but if there are, restoring from `HEAD` would erase them.

---

## 6. Execution Log entry

Append to `docs/pass1-split-and-i18n-plan.md` §8, new heading `### 2026-05-17 ... Codex — Working tree recovery` (or whatever date you complete on). Cover, in order:

1. Status — recovery complete, on commit `06eb964`, working tree clean.
2. Completed — list the §3 steps actually run.
3. Validation — paste the §3.3 and §3.4 results.
4. Flags / Roadblocks — whether Pedro chose Option A or Option B, and (if Option A) whether the move has been completed yet.
5. Next recommended step — Commit 4 (extract Welcome to `(auth)/welcome.tsx`), conditional on the OneDrive decision being acted on, not just acknowledged.

---

## 7. Definition of done

- `git status` runs without error and reports a clean tree.
- `HEAD` is `06eb964` ("Pass 1 commit 3: scaffold i18n catalogue and hydration guard").
- `npm run typecheck` and `npm run i18n:check` both pass.
- The `wc -c app/_layout.tsx` check returns the full file size (~330), not the truncated 138.
- The plan's Commit 3 Execution Log entry is present on disk, not just in the commit.
- Pedro has confirmed Option A or Option B for OneDrive remediation, and the chosen option is at least documented in the new Execution Log entry (Option A's move can be deferred to a separate window, but the choice must be recorded now).
- No corruption has recurred in the 30 seconds after OneDrive sync was resumed.
