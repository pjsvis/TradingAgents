---
id: PB-012
title: "CodeGraph Navigation Playbook"
updated_by: antigravity
role: "Build"
infrastructure: "typescript|python"
last_updated: "2026-06-24"
tags: [playbook, navigation, static-analysis]
---

# CodeGraph Navigation Playbook

## Purpose

CodeGraph provides fast symbol lookup, call graph tracing, and blast radius analysis for refactoring decisions. It is a **pre-edit safety scanner**, not a static analyzer or linter. Use it to answer "could I touch this?" before committing to a change.

## Prerequisites

- CodeGraph initialized: `codegraph init` (one-time per repo)
- Index up to date: `codegraph status` shows ✓ Index is up to date

## Core Workflow: Could I, Should I, Would I

### Step 1: Explore — "Could I?"

Before editing any shared utility, run:

```bash
codegraph explore "symbol-name"
```

**What it returns:**
- Definition location + verbatim source (current on-disk)
- All callers across the codebase
- Test coverage status (`⚠️ no covering tests found` = untested)

**Example:**
```bash
codegraph explore "DatabaseFactory"
```

### Step 2: Assess — "Should I?"

Human judgment after seeing blast radius. Ask:

- Is the blast radius proportional to the change?
- Are the callers actual dependencies or just textual imports?
- Do untested callers need tests before proceeding?
- Is this change aligned with the codebase's intent?

### Step 3: Commit — "Would I?"

If blast radius is acceptable and coverage is understood, proceed with the edit.

## Key Commands

### Symbol Exploration
```bash
codegraph explore "symbol"      # Full analysis: definition + callers + source
codegraph node "SymbolName"     # Single symbol: source + caller/callee trail
```

### Call Graph Navigation
```bash
codegraph callers "function"    # Who calls this function?
codegraph callees "function"    # What does this function call?
```

### Impact Analysis
```bash
codegraph impact "symbol"       # What code is affected by changing this symbol?
codegraph affected tests/       # Which tests cover the changed files?
```

### Project Structure
```bash
codegraph files                 # Full tree with language metadata
codegraph files --filter src/server/lib --no-metadata
codegraph status                # Index stats: files, nodes, edges by language
```

## Two-Graph Model

TypeScript and Python are indexed as separate semantic graphs. There is no cross-language import resolution.

**Tracing the TypeScript → Python bridge:**
```
src/server/lib/subprocess.ts  →  scripts/py/analyze_stream.py  →  tradingagents/
                                    (JSON lines only)
```

For cross-language questions, follow the bridge manually. Do not expect `codegraph` to show TypeScript callers of Python code.

## Limitations

| What it can't do | Why | Workaround |
|-----------------|-----|------------|
| Evaluate assertions | Static analysis only | Run tests |
| Trace data flows | No runtime introspection | Read code + trace manually |
| Show Python `assert` statements | Not indexed as symbols | `rg "assert" tradingagents/` |
| Resolve cross-language imports | Two separate graphs | Follow the bridge manually |
| Generate tests | Just flags coverage gaps | Write tests manually |

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Symbol not found` | Typo or symbol renamed | Check `codegraph files` for exact names |
| Stale index | File deleted but still in index | `codegraph sync` to rebuild |
| Missing Python coverage | Agent code has no tests | Accept as known gap; add tests before refactoring |

## When to Use CodeGraph

**Use it:**
- Before editing anything in `src/lib/`, `src/server/lib/`
- Before editing anything in `tradingagents/graph/`
- Before refactoring any shared constant or function
- To find untested code (`⚠️ no covering tests found`)

**Skip it:**
- For one-off exploratory reading (just use `read`)
- For runtime behavior questions (run the code)
- For trivial changes (copy-paste, comment edits)

## Related

- Playbook: [conventions-playbook.md](conventions-playbook.md)
- Decision: [decisions/](decisions/)