# Decision: Decommission Bifrost — Retire the Local AI Router

**Date:** 2026-06-02
**Status:** Accepted
**Supersedes:** `decisions/006-bifrost-local-ai-router.md`, `decisions/009-defer-bifrost-integration.md`

## Context

Bifrost (Maxim AI Gateway) was evaluated across three decision cycles:

1. **2026-05-13** — ADR 006 adopted Bifrost enthusiastically as a local routing layer for TradingAgents. Rationale: cost visibility, strategic routing, semantic caching, spend enforcement.
2. **2026-05-24** — ADR 009 deferred Bifrost indefinitely. Rationale: external daemon dependency, no validated need, env-var multi-provider approach sufficient.
3. **2026-06-01** — Brief resurrected and re-proposed. Installation documented via `npx @maximhq/bifrost`. A TypeScript/Bun proxy (`scripts/bifrost-proxy.ts`) was built as a lighter alternative.

Across all three cycles, no production workload ever ran through Bifrost.

A detailed technical audit was conducted on 2026-06-02 with the following findings:

### API Surface Assessment

| Endpoint | Behaviour | Assessment |
|----------|-----------|------------|
| `/api/providers` | Returns provider metadata (base_url, provider_type) | Adequate |
| `/api/models` | Returns `{name, provider}` pairs only — no context windows, no reasoning flags, no cost, no input types | **Underspecified** |
| `/v1/models` | Delegates to ZenMux provider, returns HTML SPA, not JSON model list | **Not OpenAI-compatible** |
| `/v1/chat/completions` | Returns 200, proxies correctly | Functional |

Bifrost's API is designed to serve its React web UI, not to be consumed programmatically by tools like pi-coding-agent. The `/v1/models` endpoint — the standard OpenAI path for model discovery — returns an HTML SPA rather than a JSON model list, making automatic model registration impossible.

### Cost Tracking Analysis

Bifrost's cost logging is pass-through: it echoes whatever the upstream provider reports. It does not add value beyond what direct API calls to DeepSeek, MiniMax, or OpenRouter already provide. The semantic caching promise — zero-cost responses for duplicate prompts — does not apply to our primary use case of heterogeneous agent prompts in TradingAgents.

### Architecture Fit

pi-coding-agent has become the daily driver CLI for development work. pi supports multi-provider configuration natively via `~/.pi/agent/models.json`, including cost tracking through model-level `cost` fields, context window configuration, and reasoning capability flags. Bifrost adds a routing layer between pi and providers that:
- Breaks pi's ability to auto-discover provider capabilities
- Adds ~1ms latency per request with no compensating benefit
- Introduces an additional daemon lifecycle dependency
- Obscures per-provider cost attribution behind a unified proxy

Other CLIs of interest (DeepSeek CLI, MiniMax CLI) provide fully configured direct access to their respective providers, further eroding Bifrost's value as a unified routing layer.

## Decision

**Decommission Bifrost. Retire the local AI router permanently.**

1. Remove the `bifrost` provider configuration from `~/.pi/agent/models.json`
2. Archive or delete `scripts/bifrost-proxy.ts`
3. Archive the installation brief: `briefs/archive/2026-06-01-brief-bifrost-installation.md`
4. Mark ADR 006 and ADR 009 as superseded by this decision
5. Rely on pi's native multi-provider configuration and direct provider APIs for cost tracking

## Rationale

**Against Bifrost:**
- API is UI-first, not infrastructure-first — unsuited for programmatic consumption
- Cost tracking adds no value over direct provider access
- External daemon dependency with no validated production workload
- Semantic caching irrelevant to heterogeneous agent prompts
- Breaks pi's native model discovery and provider capability detection

**For decommissioning:**
- pi's `models.json` provides equivalent multi-provider routing natively
- Direct provider APIs (DeepSeek, MiniMax, OpenRouter) provide cleaner cost attribution
- Zero additional latency, zero additional daemon, zero additional configuration layer
- Simpler debugging — no proxy to troubleshoot between pi and the upstream API

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Keep Bifrost running alongside pi | Redundant routing layer; two sources of truth for model configuration |
| Use Bifrost for cost monitoring only | Cost data is pass-through; no value add over provider-native usage tracking |
| Replace Bifrost with a custom proxy | Already evaluated in ADR 006 and rejected — maintenance burden, no semantic cache |
| Use LiteLLM, Portkey, or Helicone | Heavier, SaaS dependencies, cost data leaves the environment |

## Consequences

**What becomes easier:**
- Model configuration is a single file (`~/.pi/agent/models.json`) — one source of truth
- Cost tracking is provider-native — no proxy obscuring attribution
- Fewer running services — no Bifrost daemon to manage
- Cleaner architecture — pi talks directly to providers

**What becomes harder:**
- No unified dashboard for multi-provider cost (mitigated: each provider has its own dashboard; build aggregation from pi's session logs if needed)
- No automatic provider failover (mitigated: pi supports multiple providers; manual `/model` switch is simple)

**What we lose:**
- Semantic caching (never materialised in practice)
- Spend limit enforcement at the proxy layer (not needed — provider-native spend tracking suffices)

## Actions

- [x] Audited Bifrost API (2026-06-02)
- [ ] Remove `bifrost` provider block from `~/.pi/agent/models.json`
- [ ] Archive `scripts/bifrost-proxy.ts`
- [ ] Mark ADR 006 and ADR 009 as superseded in `decisions/INDEX.jsonl`
- [ ] Archive brief `briefs/archive/2026-06-01-brief-bifrost-installation.md`

## Related

- Supersedes: `decisions/006-bifrost-local-ai-router.md` (2026-05-13)
- Supersedes: `decisions/009-defer-bifrost-integration.md` (2026-05-24)
- Brief: `briefs/archive/2026-06-01-brief-bifrost-installation.md`
- Proxy script: `scripts/bifrost-proxy.ts`