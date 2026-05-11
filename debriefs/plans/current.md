# Current Work Plan

**Last updated:** 2026-05-10
**State:** ALERTS-PHASE2 next (ses_06bd59)
**Session:** ses_06bd59

---

## Completed (This Session — ses_a9b880)

### DEMO-EXEC-001 ✓ — Demo Execution Pipeline
- S01: `--yes` flag for non-interactive execution
- S02: `--dry-run` for plan preview without order placement
- S03: Stop/limit distances use plan values
- S04: `analysis_id` column added to `trades` table
- S05: `trading analyze --execute` chains analysis → IG execution
- Commit: `c6fcf00`

### Runbook + Ops Infrastructure ✓ — ses_a9b880
- `trading/justfile` — dedicated ops CLI with IG credentials from skate
- `docs/runbook.md` — full operations manual
- `trading/README.md` — quick reference card
- `.gitignore` — fixed `/Justfile` pattern
- AGENTS.md — branching protocol added
- All committed to `main` (0101eaa)

### CANONICAL-REGISTRY ✓ — ses_0dd889
- `canonicals/` created, seeded with 19 canonical playbooks
- `reg-mine.ts`, `reg-import.ts`, `reg-promote.ts`, `reg-sync-scripts.ts`
- Just recipes + canonical docs

---

## Open Epics — Next Prioritization

### ALERTS-PHASE2 [P1] — Custom User-Defined Alerts
**Next epic to start.** Custom alerts with Telegram/comms integration.
- Alerts table in SQLite (custom alert rules)
- CRUD CLI: `trading/commands/alerts.ts` enhancement
- Dashboard view for custom alerts
- Notification channels: Telegram, email, webhook (stretch)

### ALERTS-PHASE3 [P2] — Continuous Monitoring Daemon
- `barnacle-scan.ts` monitoring daemon
- Polling loop with configurable interval
- Dashboard alert feed / SSE stream

### Dashboard UX [P3]
- Further UI improvements

---

## Known Context

- **IG Demo**: Live, connected via skate credentials
- **Communication channels**: Telegram account available — integration point for alerts
- **Demo account balance**: CFD £10,062 | Spreadbet £10,000

---

## Mandatory Protocol

**Session start:**
```bash
git status && git branch -v   # confirm on feature branch, not main
just check                    # must be green
td usage --new-session        # new identity
td ws current                 # any active work?
td reviewable                 # what needs review?
```

**Branching rule:**
- On `main` with code to write → `git checkout -b feat/<name>` first
- Never commit directly to `main`
- Merge via PR → forces pre-PR checklist

**Every change:**
```bash
just check   # clean before touching
# ... make change ...
just check   # must pass before commit
```

---

## What to Avoid

| Pattern | Fix |
|---------|-----|
| Route `.ts` with JSX | Rename to `.tsx`, update imports |
| React-style `style={{...}}` | Use `style="background:#fff3cd"` (CSS string) |
| Extracting JSX before data layer | Always extract `lib/{route}-data.ts` first |
| Forward-fix on broken state | Revert to last known-good, then diagnose |
| Working on `main` directly | Always branch first |