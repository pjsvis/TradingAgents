# TD Playbook — Multi-Agent Coordination Protocol

> This playbook defines how multiple AI agents coordinate work on the same branch
> via git worktrees. Every agent session is a distinct identity. Multiple agents can
> work in parallel if they follow these rules.
>
> **Key principle:** Each epic = one worktree = one branch = one agent.
> No file collisions possible — worktrees are fully isolated directories.

---

## Core Principle

**Claim before touch.** Never edit a file until you have:
1. Verified you're in your own worktree (not collides with other agents)
2. Claimed the owning task (`bun scripts/agent-claim.ts <id>`)
3. Linked your working files to the task

---

## Session Startup Checklist

Run at the start of every new session, in order:

```bash
# 1. Orient: see what's in flight + worktree state
bun scripts/agent-orient.ts

# 2. Sync: check git state + collisions
bun scripts/agent-sync.ts

# 3. Get next action
bun scripts/agent-orient.ts --next
```

---

## Worktree Model

```
TradingAgents/                    ← repo root (main worktree)
├── .todos/                       ← SHARED database (all agents)
│   └── issues.db
└── ...

TradingAgents-epic-name/           ← your worktree (one per epic)
├── .td-root                     ← points to repo root
├── (isolated files)
└── ...
```

**Rules:**
- Each epic gets its own worktree (via `just wt-create <name>`)
- All worktrees share the same `.todos/` database at repo root
- No database copy, no merge step
- When your worktree is deleted, `.td-root` goes with it, DB stays intact

**Create a worktree:**
```bash
just wt-create my-epic --base main
cd ../TradingAgents-my-epic
td usage --new-session
```

**List worktrees:**
```bash
just wt-list
```

**Delete when done:**
```bash
just wt-delete my-epic
```

---

## Claiming Work

### Before touching any file

```bash
# Claim a task (checks collision, labels with session ID)
bun scripts/agent-claim.ts td-abc123

# Check what files the task owns
bun scripts/agent-sync.ts --collisions
```

### One epic per worktree (per session)

Each session works one epic in its own worktree. Tag relevant tasks to your workspace:

```bash
td ws start "Epic: My Feature"
td ws tag td-abc123 td-def456
```

---

## Logging Progress

After every substantive change, log it:

```bash
bun scripts/agent-log.ts td-abc123 "completed phase 1, found issue with X"
bun scripts/agent-log.ts td-abc123 "blocked on BRS-002 — waiting for drydock dir"
```

Use `--blocked` flag if you're stuck:
```bash
bun scripts/agent-log.ts td-abc123 "waiting on IG API token" --blocked
```

---

## Handoff Protocol

**Before closing a task**, capture structured context for the next agent:

```bash
bun scripts/agent-handoff.ts td-abc123 \
  --done "schema updated" \
  --done "CLI subcommands added" \
  --remaining "dashboard route" \
  --decision "used alerts table over separate conditions table"

# Then close
td close td-abc123
```

The handoff command creates a machine-readable record that `td show` will surface for the next agent.

---

## Ending a Worktree

When your epic is complete and merged:

```bash
# 1. Capture handoffs for all in-progress tasks
bun scripts/agent-handoff.ts td-abc123 --done "done" --remaining "next agent: finish X"
# ... repeat for all tasks

# 2. Sync and confirm no uncommitted work left behind
bun scripts/agent-sync.ts

# 3. Merge PR (via GitHub or SideCar)

# 4. Delete worktree
just wt-delete my-epic
```

---

## Branch Hygiene

- **Never commit directly to `main`**
- **Always create a worktree** for new epic work: `just wt-create <name>`
- **One epic per worktree** — clean isolation, no file collisions
- **Run `just check`** before every commit

---

## TD Labels Convention

Use these labels on tasks to signal state:

| Label | Meaning |
|-------|---------|
| `claimed-by:<session>` | Active session working this task |
| `blocked` | Task is blocked, not available |
| `needs-review` | Ready for human review |

---

## Troubleshooting

### "Task already claimed by another session"
→ Don't force-claim. Comment on the task requesting handover.

### "I'm about to edit a file someone else is working on"
→ This can't happen if you're in your own worktree. Worktrees are fully isolated.

### "I started work without claiming first"
→ Run `bun scripts/agent-claim.ts <id>` now, then `bun scripts/agent-log.ts <id> "retroactively claimed"` to backfill the log.

### "My session died mid-work"
→ On reconnect: `bun scripts/agent-sync.ts` to see what you had. Reclaim your tasks if they're still open.

### "Worktree doesn't have .td-root"
→ Run `just wt-list` to check. If missing, the worktree was likely created manually.
  Fix: `echo "/path/to/repo/root" > .td-root` (or use `just wt-delete <name>` then recreate via `just wt-create`).

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/worktree-init.ts` | Create/delete worktrees with `.td-root` |
| `scripts/agent-orient.ts` | Full session startup |
| `scripts/agent-claim.ts` | Claim a task before editing |
| `scripts/agent-log.ts` | Log progress to a task |
| `scripts/agent-handoff.ts` | Structured handoff before closing |
| `scripts/agent-sync.ts` | Sync: git state + file collisions |

---

## Related

- `AGENTS.md` — Project identity, coding rules, failure modes
- `debriefs/plans/current.md` — Current work plan and priority order
- `playbooks/conventions-playbook.md` — Coding conventions
- `briefs/2026-05-11-td-worktree-test-results.md` — E2E test evidence (for feature request to Marcus)