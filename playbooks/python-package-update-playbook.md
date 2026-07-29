---
id: PB-013
title: "Python Package Cherry-Pick Playbook"
updated_by: antigravity
role: "Build"
infrastructure: "python"
last_updated: "2026-06-24"
tags: [playbook, python, tradingagents, cherry-pick, upgrade]
---

# Python Package Cherry-Pick Playbook

## Purpose

Selective cherry-picking of valuable upstream fixes without merging the full branch. Upstream is a feature source, not a co-evolving co-repo.

**Upstream:** `https://github.com/TauricResearch/TradingAgents.git` (read-only)

## Principles

1. **Cherry-pick only, never merge.** We take specific commits, not the full branch.
2. **Isolate our customizations.** DeepSeek/MiniMax subclasses and analyze_stream bridge live in our layer.
3. **Test each cherry-pick.** Run tests after each commit, not after a batch.
4. **Document why.** Every cherry-pick gets a rationale in the decision record.

## Prerequisites

- Working tree is clean (`git status`)
- All tests passing (`uv run pytest`)
- Upstream remote configured and accessible

## Cherry-Pick Workflow

### Step 1: Evaluate Upstream

```bash
# Fetch latest upstream
git fetch upstream

# View commits since last cherry-pick
git log HEAD..upstream/main --oneline

# Identify valuable isolated fixes (see decision/016 for candidate list)
```

### Step 2: Cherry-Pick Candidates

For each valuable commit:

```bash
# Cherry-pick the commit
git cherry-pick <commit-sha>

# Resolve any conflicts (prefer our changes unless upstream has a critical fix)
# If conflict: manually resolve, then git add + git cherry-pick --continue

# Run tests
uv run pytest -x -q

# If tests pass: continue to next cherry-pick
# If tests fail: git cherry-pick --abort, document the blocker
```

### Step 3: Record the Cherry-Pick

Add to `decisions/016-python-package-update-strategy.md`:

```markdown
| `COMMIT` | Description | Applied: YYYY-MM-DD |
```

### Step 4: Commit

```bash
git add -A
git commit -m "chore: cherry-pick <description> from upstream/<commit>"
```

## Rollback

If a cherry-pick breaks something:

```bash
# Revert the specific commit
git revert <commit-sha>
git push origin main
```

Or reset to last known-good state:

```bash
git reset --hard $(cat checkpoints/baseline-commit.txt)
```

## What to Cherry-Pick

**High value, low risk:**
- Structured output hardening
- Error handling improvements (VendorError hierarchy)
- Data normalization fixes
- Transport error handling

**Medium value, evaluate individually:**
- New data vendors (we may not use them)
- New LLM providers (we may not use them)
- Model catalog refreshes

**Skip:**
- Architectural changes (unified LLM registry)
- New providers we don't use
- i18n changes (we handle separately)
- Report-tree writer (we have our own bridge)

## Common Issues

| Issue | Fix |
|-------|-----|
| Conflict in modified files | Prefer our changes unless upstream fix is critical |
| Tests fail after cherry-pick | Revert immediately, document why |
| Upstream has breaking change | Skip, document in decision as "not needed" |
| Too many cherry-picks | Batch by theme (error handling, data reliability, etc.) |

## Related

- Decision: [decisions/016-python-package-update-strategy.md](decisions/016-python-package-update-strategy.md)
- Playbook: [database-lifecycle-playbook.md](database-lifecycle-playbook.md)