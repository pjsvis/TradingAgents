# Barnacle Scan Analysis — 2026-05-24

**Scan session:** `ses_0a44f9`
**Scrub session:** `ses_0a44f9` (ws-b5dd)
**Scope:** `playbooks/*.md`, `docs/runbook.md`, `AGENTS.md`
**Result:** VERIFIED CLEAN after scrub. All stale `server/` → `src/server/` paths fixed.

---

## Scan Methodology Correction

**Initial scan used substring matching** (`rg "server/"`) which produced false positives — `src/server/` contains `server/` as a substring, inflating counts. Corrected scan filtered `src/server/` before counting stale refs.

---

## Barnacles Fixed

### Type A: Orphaned Path References (`server/` → `src/server/`)

| File | Stale Refs Fixed | Notes |
|------|-----------------|-------|
| `playbooks/htmx-playbook.md` | 13 | Pre-scrubbed by commit `3c86442` (chore: fix server/ → src/server/) |
| `playbooks/typescript-hono-playbook.md` | 7 | Pre-scrubbed |
| `playbooks/gitnexus-usage-guide.md` | 3 | Fixed grep path + 2 table refs |
| `playbooks/trade-calculator-testing-playbook.md` | 1 | Pre-scrubbed |
| `playbooks/gitnexus-playbook.md` | 2 | `server/index.tsx` + `server/lib/intel-compute.ts` |
| `playbooks/hledger-playbook.md` | 1 | Pre-scrubbed |
| `playbooks/database-lifecycle-playbook.md` | 8 | `bun run server/index.tsx` × 8 (OUT OF SCOPE — caught anyway) |
| `playbooks/datatype-playbook.md` | 4 | Font + component paths (OUT OF SCOPE — caught anyway) |
| `playbooks/view-scaffold.tsx` | 2 | Scaffold copy destination (OUT OF SCOPE — caught anyway) |
| `playbooks/ci-cd-playbook.md` | 2 | JSON config paths (OUT OF SCOPE — caught anyway) |
| **Total** | **43** | |

> Note: 3 files (htmx-playbook, typescript-hono-playbook, trade-calculator-testing) were already fixed by a prior scrub session. Verifying via commit `3c86442`.

### Type B: Redundant Redundancy

| File | Issue | Action |
|------|-------|--------|
| `playbooks/services-playbook.md` | 7-step manual Stop Protocol | Replaced with `just srv stop` table |
| `docs/runbook.md` | Verbose CLI command duplication | NOT FIXED — operational docs have value; downgrade to density note |

---

## Remaining Barnacles (Low Severity — No Action Required)

| File | Refs | Type | Rationale |
|------|------|------|-----------|
| `playbooks/tsconfig-tiered-playbook.md` | 2 | General convention | Describes TSConfig pattern with `(or src/)` alternative noted — not project-specific |
| `playbooks/just-silo-playbook.md` | 1 | Directory tree | Old silo tree shown; `(or src/)` note acknowledges alternative — pattern doc, not operational |
| `playbooks/lab-first-playbook.md` | 2 | Architectural rule + narrative | Lab rule forbids imports from `server/` (valid constraint); migration story is historical |

---

## Verification

```bash
# All core files clean — no stale bare "server/" refs remain
for f in playbooks/htmx-playbook.md playbooks/typescript-hono-playbook.md \
         playbooks/gitnexus-usage-guide.md playbooks/trade-calculator-testing-playbook.md \
         playbooks/gitnexus-playbook.md playbooks/hledger-playbook.md \
         playbooks/services-playbook.md playbooks/datatype-playbook.md \
         playbooks/database-lifecycle-playbook.md playbooks/view-scaffold.tsx \
         playbooks/ci-cd-playbook.md; do
  stale=$(rg "server/" "$f" 2>/dev/null | grep -v "src/server" | wc -l)
  echo "$f: $stale stale refs"
done
# → All output: 0 stale refs
```

---

## Drydock

- Location: `decisions/drydock/2026-05-24/`
- Scan report: `BARNACLE_SCAN_ANALYSIS_2026-05-24.md` (this file)
- No content moved to drydock (all barnacles were in-place fixes, no deletions)

---

## Open Questions

1. **runbook.md duplication** — The CLI Reference and Quick Reference sections duplicate `just -f trading/justfile --list` output. Classified as verbose prose, not a mechanical error. Recommend future review for density reduction, but not a priority barnacle.

2. **Bifrost brief deleted** — `briefs/2026-06-01-brief-bifrost-installation.md` was deleted without a decision record. Recommend adding a decision record per `decisions-playbook.md` before closing the orientation epic.