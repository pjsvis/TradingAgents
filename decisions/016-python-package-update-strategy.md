# Decision: Python Package Update Strategy — Functionality Over Dependency

**Date:** 2026-06-24
**Status:** Accepted

## Context

`tradingagents` is an editable install from a cloned upstream repository. We have local modifications (Markov regime engine, tree view, barnacle scrubber, Twelve Data integration) that are not in the upstream.

**Current state:**
- Local version: v0.2.5-based
- Last upstream sync: 2026-05-20
- Upstream: v0.3.0 available (53 commits ahead)
- Upstream remote: `https://github.com/TauricResearch/TradingAgents.git` (fetch only)

**The problem:** Treating upstream as a co-evolving co-repo causes merge conflicts and maintenance burden. Our customizations (DeepSeek/MiniMax LLM clients, analyze_stream bridge) don't need to track upstream's architectural changes.

## Decision

**We do not treat upstream as a co-evolving co-repo. We treat it as a feature source.**

### Principles

1. **No continuous merging.** We pin to our current version (v0.2.5-based).
2. **No dependency relationship.** Upstream is a library we consume selectively.
3. **Cherry-pick for value.** When upstream has a fix or feature we need, we cherry-pick it.
4. **Isolate our customizations.** DeepSeek/MiniMax subclasses, analyze_stream bridge live in our layer, not upstream.
5. **Never push to upstream.** The `upstream` remote is read-only.

### Why This Works

The upstream changes we care about (structured output hardening, error handling, data normalization) are **isolated commits**, not architectural changes. They don't require merging the full branch — just pulling specific fixes.

### What We Don't Need From Upstream

| Upstream Change | Why We Skip It |
|-----------------|----------------|
| New providers (Bedrock, Groq, Mistral) | We don't use them |
| Polymarket / FRED data vendors | Not in our stack |
| Unified LLM registry | We have our own |
| Report-tree writer | We have our own bridge |
| i18n for agents | We handle output separately |

## Cherry-Pick Candidates (v0.3.0)

| Commit | Description | Value | Risk |
|--------|-------------|-------|------|
| `517eeaf` | Harden structured output for local servers + thinking models | **High** | Low |
| `7df18fc` | VendorError hierarchy, graceful degradation | **High** | Low |
| `8694bd0` | MiniMax reasoning_split via extra_body | **High** | Low |
| `308757c` | Catch http.client transport errors in StockTwits | **Medium** | Low |
| `eeb84aa` | Reddit RSS-first with 429 backoff | **Medium** | Low |
| `0405168` | Coerce null-ish strings in optional float fields | **Medium** | Low |
| `9ad98c5` | Normalize ticker on news path | **Medium** | Medium |
| `6560883` | Respect vendor chain, log failures | **Medium** | Low |
| `709fe2b` | Dedupe trailing message in debug stream | **Low** | Low |

## Actions

- [x] Document the upstream repo URL
- [ ] Cherry-pick valuable isolated fixes from upstream
- [ ] Update playbook to reflect cherry-pick workflow
- [ ] Register this decision in `decisions/INDEX.jsonl`

## Related

- Playbook: [playbooks/python-package-update-playbook.md](playbooks/python-package-update-playbook.md)
- Playbook: [playbooks/database-lifecycle-playbook.md](playbooks/database-lifecycle-playbook.md)
- Brief: [briefs/2026-06-24-brief-lightweight-cost-tracking.md](briefs/2026-06-24-brief-lightweight-cost-tracking.md)