---
id: BRIEF-MARKOV-SMOOTH-001
title: "Markov Regime Smoothing — Reduce Signal Noise"
date: "2026-06-24"
status: draft
author: antigravity
tags: [brief, markov, regime, smoothing, tradingagents]
---

# Brief: Markov Regime Smoothing Enhancement

## Problem Statement

Our threshold-based Markov regime detection (20-bar cumulative return) is statistically sound but practically noisy. Regime labels can flip on single volatile days, creating a "barcode" pattern similar to what Kryptera observed with raw HMM output.

**Core issue:** A statistically correct model isn't automatically tradeable.

## Context

### Current Implementation

From `src/server/lib/markov/state.ts`:
- Classification: ±5% threshold over 20-bar lookback
- Bull: cumulative return >= +5%
- Bear: cumulative return <= -5%
- Sideways: between -5% and +5%

No smoothing — each bar is classified independently based on the prior 20 bars.

### What We Learned from Kryptera

1. **206 flips → 99 flips with 5-day majority vote** — 52% noise reduction
2. **State labeling matters** — we avoid this problem with deterministic thresholds
3. **Regime knowledge is about "which game you're playing"** — not about maximizing returns from regime trading alone
4. **Smoothing window is empirical** — 3-day (faster, noisier), 5-day (balanced), 10-day (stable, lagging)

## Proposed Solution

### 1. Majority Vote Smoothing

Add an optional smoothing parameter `smoothWindow` (default: 3) to regime classification:

```typescript
export function classifyStateSmooth(
  returns: number[],
  config: Partial<StateConfig> = {},
  smoothWindow: number = 3
): { current: MarketState; smoothed: MarketState; flipRate: number }
```

- `current`: Today's raw classification (existing logic)
- `smoothed`: Most common regime in last N days (majority vote)
- `flipRate`: Percentage of days with regime change (noise indicator)

### 2. Regime Flip Rate Tracking

Add to regime data layer (`src/server/lib/markov/regime-data.ts`):
- Track cumulative flip count over the lookback period
- Surface as `flipRate` in regime command output
- Target: <15% flip rate (vs Kryptera's 27% raw → 13% smoothed)

### 3. Feature Enrichment (Optional Enhancement)

Current features: single 20-bar cumulative return.

Additional features for screening engine:
- `volatilityRatio`: current 20-bar vol vs 200-bar historical vol
- `rangeCompression`: ATR(5) / ATR(20) — squeeze signal
- `momentumDivergence`: price vs SMA(20) position

These align with Kryptera's features (log return + vol + range) and would improve screening accuracy.

## Implementation Phases

### Phase 1: Smoothing (SMRK-001)
- Add `smoothWindow` parameter to `classifyState()` 
- Compute smoothed regime via majority vote
- Track flip rate metric
- Update regime CLI output

### Phase 2: Flip Rate Dashboard (SMRK-002)
- Add `flipRate` to regime data layer
- Surface in regime command: `just regime TKA.DE --flip-rate`
- Warn if flip rate > 20% (signal too noisy)

### Phase 3: Feature Enrichment (SMRK-003)
- Add volatility ratio feature
- Add range compression feature
- Integrate with screening engine

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Flip rate | <15% | (regime changes / total days) |
| Regime consistency | >5 days avg streak | Mean regime duration |
| Smoothing latency | 0 days (same bar) | Implementation |

## Related

- Implementation: [src/server/lib/markov/](src/server/lib/markov/)
- Existing: [briefs/epic-strategy-intake-phase1.md](briefs/epic-strategy-intake-phase1.md)
- Reference: Kryptera HMM article (Medium, 2026-06-28)