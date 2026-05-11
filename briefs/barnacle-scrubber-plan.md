# BRIEF: BARNACLE-SCRUBBER — Implementation Plan

**Date:** 2026-05-11
**Author:** Agent (orientation session)
**Status:** Active — decisions resolved, implementation pending multi-agent ops conventions

---

## Context

Three briefs dated 2026-05-11 define the Barnacle Removal System (BRS):

| Brief | Role |
|-------|------|
| `brief-barnacle-removal.md` | Conceptual framework: functional map heuristic, justify engine, quarantine policy |
| `brief-brnacle-scraper-prompt.md` | Agent prompt, operational constraints, anomaly escalation checklist |
| `brief-reintegration-protocol.md` | Recovery flow for Chesterton's Fence scenarios, deployment sequencing |

**Key distinction from existing work:**

- `scripts/barnacle-scan.ts` (already exists) = **monitoring daemon** for ALERTS-PHASE3. Alerts on barnacles but does not act on them.
- "Barnacle Scrubber" (to be built) = **agent that modifies files**. Moves content to `/drydock/`, slim text, outputs a deletion log.

---

## Target Scope

### Files to Scan

| Target | Lines | Rationale |
|--------|-------|-----------|
| `playbooks/*.md` | ~3,555 across 13 files | Primary convention surface — highest barnacle density |
| `docs/runbook.md` | 354 | Operational runbook — must be surgically clean |
| `AGENTS.md` | 400 | Agent rules — misdirection here is costly |
| `docs/just/*.md` | ~100 | Just command documentation |
| `docs/help.md` | ~100 | User-facing help |

### Not in Scope (first iteration)

- `scripts/` — too dynamic, better handled by linters
- `src/` — TypeScript type safety makes barnacles less likely
- `tradingagents/` — Python package, separate concern

---

## Barnacle Classification

### Mechanical Checks (Rules-Based)

| Class | Pattern | Example |
|-------|---------|---------|
| **Orphaned references** | Tool-generated path patterns stale after restructure | `server/lib/db.ts` in docs (now `src/server/lib/db.ts`) |
| **Temporal decay** | Instructions for processes now automated | Manual sync steps for a process with a `just` recipe |
| **Role mismatch** | Outdated team names, role names | Old team names not in current directory |
| **Redundant redundancy** | Steps for a process with a known runbook/script | A "how to restart server" section when `just srv restart` exists |
| **Verbose prose** | Long explanations reducible to ≤1 line | "I have updated the X" → "Updated X" |

### LLM Checks (Semantic)

| Class | Pattern |
|-------|---------|
| **Doc/code divergence** | Rule says X, code does Y |
| **Tool-default fights** | Conventions contradicting tool defaults (e.g. `Justfile` vs `justfile`) |
| **Chesterton's Fence** | "Load-bearing" comment implying hidden dependency |
| **Cross-doc conflicts** | Same topic addressed differently in two playbooks |

---

## What to Build

### 1. Core Scrubber Script — `scripts/barnacle-scrubber.ts`

**Purpose:** The Barnacle Scrubber agent. Takes target paths, analyses each file, and acts on barnacles.

```typescript
// Usage:
bun scripts/barnacle-scrubber.ts                    // interactive: confirm each action
bun scripts/barnacle-scrubber.ts --auto           // non-interactive: apply all
bun scripts/barnacle-scrubber.ts --dry-run         // show what would change
bun scripts/barnacle-scrubber.ts playbooks/        // target specific dir/file
bun scripts/barnacle-scrubber.ts --drydock         // drydock mode only (move, don't slim)
bun scripts/barnacle-scrubber.ts --slim            // slim mode only (condense, don't move)
bun scripts/barnacle-scrubber.ts --report          // generate DELETION_LOG.md only
bun scripts/barnacle-scrubber.ts --restore         // restore from drydock
```

**Phases:**

1. **Ingest** — Load target files
2. **Mechanical scan** — Apply rules-based barnacle detection
3. **LLM scan** — Semantic analysis for doc/code divergence, cross-doc conflicts
4. **Draft** — Produce modified file + drydock archive entry
5. **Report** — Generate `DELETION_LOG.md`
6. **Confirm** — Interactive: user confirms, skips, or escalates each action
7. **Apply** — Write modified files, populate `/drydock/`

**Quarantine policy:**
- Zero permanent deletion
- Barnacles moved to `/drydock/{YYYY-MM-DD}/{original-path}/{block-id}.md`
- Pointer comment left in source: `<!-- BARNACLE: moved to /drydock/... -->`
- `@load-bearing: [Date]` annotation = scrubber-proof (bypass on future runs)

### 2. Anomaly Escalation Engine

When the scrubber encounters a potential Chesterton's Fence:

| Type | Detection Signal | User Prompt |
|------|-----------------|-------------|
| Context Conflict | Service ref not in manifest but implies critical edge case | "Move or preserve?" |
| Ambiguous Instruction | Manual step for a process now automated | "Automated or manual?" |
| Stale Metadata | Attribution to decommissioned team | "Reassign or drydock?" |
| Logic Paradox | Comment contradicts code | "Comment is wrong or code is wrong?" |

Format for escalation: structured YAML block (machine-readable for future automation).

### 3. `/drydock/` Archive — `decisions/drydock/`

```
decisions/drydock/
├── INDEX.jsonl              # all drydocked blocks (append-only archive)
├── pending.jsonl            # current scan's pending issues (Gum-presenter reads this)
├── DELETION_LOG.md          # human-readable log (append-only)
└── YYYY-MM-DD/
    └── {source-relative-path}/
        └── block-{id}.md    # individual barnacle text
```

**INDEX.jsonl** schema:
```jsonl
{"id":"BRS-001","source":"playbooks/services-playbook.md","line":12,"severity":"warning","type":"orphaned_reference","text":"...","justification":"Service 'auth-v1' decommissioned Jan 2026","drydocked_at":"2026-05-11T..."}
```

**pending.jsonl** (escalation queue for Gum presenter):
```jsonl
{"id":"BRS-001","source":"playbooks/services-playbook.md","line":12,"severity":"warning","type":"orphaned_reference","text":"...","justification":"..."}
```

**Escalation flow:**
1. Scrubber writes `pending.jsonl` (non-interactive — all findings)
2. Gum presenter reads `pending.jsonl`, renders Charm yes/no table
3. User decisions written back to `pending.jsonl` (or a `_decisions.jsonl` sidecar)
4. Scrubber reads decisions, applies approved changes
5. Approved barnacles moved to `decisions/drydock/YYYY-MM-DD/` + indexed in `INDEX.jsonl`

### 4. Deletion Log — `decisions/drydock/DELETION_LOG.md`

Append-only human-readable log.

```markdown
# Barnacle Deletion Log

## 2026-05-11

| Source | Block | Justification | Action |
|--------|-------|---------------|--------|
| playbooks/services-playbook.md | block-001 | "Service 'auth-v1' decommissioned Jan 2026" | drydocked |
| playbooks/ig-api-playbook.md | block-002 | "Old path reference 'server/lib' replaced by src/server/lib" | slimmed |
```

**Rule:** Do not edit past entries. Only append.

### 5. Re-Integration Protocol (Recovery Flow)

When a barnacle is later identified as load-bearing:

```bash
# 1. Locate in drydock
bun scripts/barnacle-scrubber.ts --restore drydock/2026-05-11/AGENTS.md/block-001.md

# 2. Confirm justification (interactive prompt)
# 3. Refactor before re-inserting (scrubber-proof = @load-bearing + brief)
# 4. Apply
```

### 6. Just Recipes

```just
# Barnacle scrubber group
[barnacle]
bs-scan:     # Run mechanical + LLM scan, print report
bs-dry-run   # Show what would change, no file modifications
bs-scrub     # Interactive: confirm each action before applying
bs-auto      # Non-interactive: apply all without prompting
bs-drydock   # Restore from drydock (interactive)
bs-log       # Show deletion log
```

---

## TD Epic: BARNACLE-SCRUBBER

```
BARNACLE-SCRUBBER [epic]
├── BRS-001 [td add "Scrubber core: ingest, mechanical scan, drydock move"]
├── BRS-002 [td add "LLM scan: semantic analysis, cross-doc conflict detection"]
├── BRS-003 [td add "Slim phase: condense verbose prose via LLM"]
├── BRS-004 [td add "Anomaly escalation: Chesterton's Fence detection + user prompts"]
├── BRS-005 [td add "Re-integration: recovery flow + @load-bearing annotation"]
├── BRS-006 [td add "Deletion log + drydock INDEX generation"]
└── BRS-007 [td add "Just recipes + operational docs"]
```

**Recommended ordering:** BRS-001 → BRS-002 (LLM scan needs the file-loading infrastructure) → BRS-003 (slim builds on both) → BRS-004 (escalation is orthogonal) → BRS-005 (depends on drydock existing) → BRS-006 (depends on all above) → BRS-007 (integration + docs)

**Effort estimate:**
- BRS-001: ~4 hours (file loading, mechanical rules, drydock move)
- BRS-002: ~3 hours (LLM prompt engineering, response parsing)
- BRS-003: ~2 hours (text condensation, builds on BRS-002)
- BRS-004: ~2 hours (escalation UI, structured YAML output)
- BRS-005: ~2 hours (restore flow, annotation format)
- BRS-006: ~1 hour (log generation, INDEX.jsonl)
- BRS-007: ~2 hours (just recipes, operational docs)

**Total: ~16 hours across 7 stories**

---

## Decision Record

| Decision | Choice |
|----------|--------|
| LLM provider | OpenRouter (via `scripts/lib/llm.ts`), `google/gemini-2.5-flash-lite-preview-09-2025` |
| First-run target | `playbooks/` only — learn craft here before moving to system docs |
| Interaction mode | Non-interactive by default; Gum-based escalation pipeline presents pending.jsonl via Charm for human yes/no |
| Drydock location | `decisions/drydock/` (gitignored) — same location as other decision records |
| Deletion log | `decisions/drydock/DELETION_LOG.md` (append-only) |
| INDEX format | `decisions/drydock/INDEX.jsonl` — one row per drydocked block |
| Pending queue | `decisions/drydock/pending.jsonl` — Gum-presenter reads this for interactive review |

**Decision doc:** `decisions/007-barnacle-drydock-location.md`

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Word count reduction in target playbooks | 10–20% |
| Zero logic breakage in first run | Required |
| Drydock → Retained ratio | Track for calibration |
| Anomaly escalation rate | <5% of barnacles (means criteria are well-tuned) |
| pending.jsonl → approved rate | >80% (means scrubber is not too aggressive) |
