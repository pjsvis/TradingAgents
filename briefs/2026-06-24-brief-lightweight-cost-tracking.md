---
id: BRIEF-2026-06-24-LIGHT-COST
title: "Lightweight Cost Tracking for TradingAgents"
date: "2026-06-24"
status: draft
author: antigravity
tags: [brief, tradingagents, cost, llm]
---

# Brief: Lightweight Cost Tracking for TradingAgents

## Problem Statement

TradingAgents makes many LLM calls per analysis. Each call costs money. We have no visibility into how much each analysis costs.

**Core need:** Not spend too much.

**Everything else is incidental:**
- Unified multi-provider dashboards
- Semantic caching
- Spend enforcement / circuit breakers
- Strategic model routing

These are interesting. They are not the problem.

## Context

### What We Tried

- **Bifrost** — Local AI gateway. Rejected: UI-first API, pass-through cost tracking, adds daemon dependency with no validated production workload. (ADR 013)

### What We Have

- LangChain responses include `usage_metadata` with token counts
- Per-provider dashboards (DeepSeek, MiniMax, OpenRouter) give post-hoc spend visibility
- `analyze_stream.py` is the single entry point for all analysis runs

### What We Need

Simple visibility into per-analysis cost, without adding services or complexity.

## Proposed Solution

Three files, no new services.

### 1. Cost Catalog (`tradingagents/llm_clients/cost_catalog.py`)

Static mapping of model → cost per million tokens.

```python
COST_PER_MILLION_TOKENS = {
    "deepseek/deepseek-v4-flash": {"input": 0.10, "output": 0.30},
    "deepseek/deepseek-v4": {"input": 1.00, "output": 3.00},
    "minimax/m2.1-flash": {"input": 0.05, "output": 0.10},
    # ... extend as needed
}
```

Manual, not dynamic. Prices change slowly; provider dashboards confirm accuracy.

### 2. Client Instrumentation (`tradingagents/llm_clients/openai_client.py`)

After each LLM call, write a JSON line to a cost log:

```json
{"ts": "2026-06-24T10:15:30Z", "model": "deepseek-v4-flash", "prompt_tokens": 1200, "completion_tokens": 340, "cost_usd": 0.00222}
```

Three lines of code wrapping the LangChain response. Log path configurable via env var.

### 3. Per-Run Accumulator (`scripts/py/analyze_stream.py`)

At analysis end:
- Read cost log for this run (filtered by thread/ticker)
- Sum total cost
- Emit as SSE `complete` event:

```json
{"event": "complete", "data": {"ticker": "TKA.DE", "cost_usd": 0.034, "calls": 12}}
```

Optional threshold: if `cost_usd > 0.50`, emit a warning in the SSE stream.

## What We Get

| Metric | Today | With This |
|--------|-------|-----------|
| Per-analysis cost | Unknown until provider bill | Visible at end of run |
| Cost spike detection | Manual (provider dashboard) | Automatic warning in SSE |
| Historical cost tracking | None | JSONL logs in `data/cost/` |
| Additional services | 0 | 0 |
| External dependencies | 0 | 0 |

## What We Don't Get

- Semantic caching (duplicate prompts still cost twice)
- Automatic provider failover
- Unified multi-provider dashboard
- Spend enforcement (circuit breaker)

None of these were materializing. The problem is knowing how much we're spending, not controlling it programmatically.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Prices change | Catalog is a simple dict; update when provider prices change |
| Log file grows | Rotate logs by date; prune after 90 days |
| Cost under-reporting | Confirm against provider dashboards monthly |
| No circuit breaker | User sets `--max-cost 0.50` arg; exceeds threshold → warning, not block |

## Success Criteria

1. Every `complete` SSE event includes `cost_usd` and `calls`
2. Cost logs written to `data/cost/YYYY-MM-DD.jsonl`
3. Threshold warning emitted when cost exceeds configurable limit
4. No new services required
5. `just check` passes

## Related

- Decision: [decisions/013-decommission-bifrost.md](decisions/013-decommission-bifrost.md)
- Script: [scripts/py/analyze_stream.py](scripts/py/analyze_stream.py)
- Client: [tradingagents/llm_clients/openai_client.py](tradingagents/llm_clients/openai_client.py)