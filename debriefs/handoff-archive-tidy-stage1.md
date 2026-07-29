# Handoff: Archive Tidy-Up — Stage 1 Complete, Stage 2 Ready

**Date:** 2026-07-29
**Session:** ses_67903f
**Branches:** `chore/archive-tidy-stage1` (PR #35), `feat/markov-phase2` (PR #34)
**Next task:** td-3723c2 — Archive tidy-up Stage 2

## What happened this session

### Markov Phase 2 review (td-5ce2b5)
Reviewed the Markov Regime Engine Phase 2 epic. Found one real bug (S03 HMM
transmat ordering — the Python bridge returned the transition matrix in the
HMM's internal state order, not the relabelled bull/side/bear order). S03 was
rejected, fixed, and re-approved. All five stories and the epic are now closed.
PR #34 is open awaiting server-side review.

**Key fix (commit e83964a on feat/markov-phase2):**
`scripts/py/markov_hmm.py` now permutes `transmat` by `sorted_states` so both
axes are in relabelled ordering. Regression test added to `testHmm` that
cross-checks the returned transmat against empirical transitions of
`labeled_states`.

**Independent verification done:**
- Incomplete-beta vs `scipy.special.betainc` — 10 cases, ≤1e-9
- P(signal>0) vs 2M-draw Monte Carlo — within stderr
- Walk-forward no-lookahead confirmed
- Stationary πP=π residual < 1e-10

### Archive tidy-up Stage 1 (td-3723c2 prerequisite)
Process folders (briefs, debriefs, decisions, playbooks) had accumulated
nested subdirectories and done/superseded artefacts. Stage 1 was the
mechanical clear-cut:

- 51 done/superseded briefs → `.archive/briefs/`
- 39 done debriefs + reviews/plans → `.archive/debriefs/`
- `decisions/drydock/` → `.archive/decisions/drydock/`
- All four process folders flattened (no subdirectories)
- `reg-sync.ts` updated: `recursive: false` for process folders + active
  guardrail (throws on subdirs, fails `just check`)
- `.archive/README.md` written
- Playbooks updated (debriefs-playbook, conventions-playbook)
- Pre-existing gate fixes applied (tsconfig, barnacle-scrubber biome)

PR #35 is open awaiting review.

## What's left

### Stage 2 — triage the active pile (td-3723c2)
The remaining 32 briefs and 12 debriefs are all marked `active` or `open`.
Most are from May. The status field is unreliable — "active" often means
"nobody marked it done", not "work in progress". For each file:
1. Read it
2. Check if the work it describes was completed (git log, codebase)
3. If done → re-flag `done`, move to `.archive/`
4. If genuinely live → leave, confirm `active` is correct
5. If parked/deferred → leave with a note

This is judgement work. The signal-to-noise problem lives here.

### PR reviews
- PR #34 (Markov Phase 2) — awaiting server-side review
- PR #35 (Archive tidy Stage 1) — awaiting server-side review

Both are on branches off `main`. Neither should be merged locally.

## Decisions made
- `.archive/` top-level dot-directory (not nested `briefs/archive/`) — hides
  from Glow, keeps archeology available, reg-sync doesn't need exclude rules
- Active guardrail in reg-sync (not just passive recursion drop) — fails fast
  at mess-creation time
- `debriefs/plans/current.md` archived — had merge conflict markers, was May 11,
  referenced long-done work. Playbook updated to use `td list`/`td status`
  instead
- CRITICAL FILE modifications user-authorised: tsconfig.server.json,
  pyproject.toml, AGENTS.md (markov-phase2), tsconfig.server.json +
  barnacle-scrubber (archive-tidy)

## State of the repo
- `main` is at `fb0804f` (clean)
- `feat/markov-phase2` has 13 commits ahead of main (PR #34)
- `chore/archive-tidy-stage1` has 2 commits ahead of main (PR #35)
- `just check` green on both branches
- Untracked files on main: `.codegraph/`, `checkpoints/`, several undated
  briefs/decisions/docs/playbooks — these are pre-existing, not part of either
  PR. Stage 3 of the tidy-up (the undated files) should address them.

## How to pick up
```bash
git checkout main
git pull origin main
td usage --new-session
td start td-3723c2   # Stage 2 triage
```
Start by listing the active pile:
```bash
ls briefs/*.md       # 32 files
ls debriefs/*.md     # 12 files
```
