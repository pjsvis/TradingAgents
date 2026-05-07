# Portfolio Snapshot — 2026-05-07

**Date:** 2026-05-07
**Status:** User-provided, unverified against live data
**Purpose:** Input for trade calculator — account balances, positions, risk parameters

---

## Cash / Liquid Accounts

| Account | Balance | Currency | Platform | Notes |
|---------|---------|----------|----------|-------|
| Spread Bet & CFD | £511.64 | GBP | IG (Z6B1MT) | Demo account for test trading |
| ISA Accounts | £20,868.50 | GBP | IG (Z6B1MS) | 3.75% AER |
| AJBell SIPP | £108,221.44 | GBP | AJBell | Policy: ABQPMDS |
| Aviva Cash | £134,761.89 | GBP | Aviva | Policy: AV2238306-001 |
| NS&I | £15,875.00 | GBP | NS&I | Premium bonds |
| Utmost EWA | £34,171.21 | GBP | Utmost | |
| Utmost MSA | £2,697.82 | GBP | Utmost | |
| **Total Cash/Liquid** | **£317,206.96** | | | |

---

## Share Dealing Positions (IG Share Dealing)

| Ticker | Shares | Value | Currency | Exchange |
|--------|--------|-------|----------|----------|
| thyssenkrupp AG (TKA.DE) | 115 | €1,255.80 | EUR | XETRA |
| Tkms AG & Co KGaA (TKMS.DE) | 5 | €407.00 | EUR | XETRA |
| **Total Share Dealing** | | **€1,662.80** | | |

**Note:** No separate cash balance shown for Share Dealing. Cash may be held in the ISA account or zero.

---

## Platform Summary

| Platform | Type | Cash | Positions | Total Exposure |
|----------|------|------|-----------|----------------|
| IG — Spread Bet | Demo | £511.64 | — | £511.64 |
| IG — ISA | ISA | £20,868.50 | TKA.DE, TKMS.DE (via Share Dealing?) | ~£22,420 |
| AJBell | SIPP | £108,221.44 | — | £108,221.44 |
| Aviva | Company Pension | £134,761.89 | — | £134,761.89 |
| NS&I | Cash | £15,875.00 | — | £15,875.00 |
| Utmost EWA | Pension? | £34,171.21 | — | £34,171.21 |
| Utmost MSA | Pension? | £2,697.82 | — | £2,697.82 |

---

## Questions to Verify

1. **Share Dealing cash:** Is there a separate cash balance for IG Share Dealing, or is cash held in the ISA?
2. **thyssenkrupp / Tkms:** Are these positions in IG Share Dealing, or held elsewhere?
3. **Utmost EWA / MSA:** Are these pensions (locked) or accessible investment accounts?
4. **Total investable:** How much of the above is available for new trades vs. locked in pensions?

---

## Trade Calculator Defaults

Based on this snapshot, suggested calculator defaults:

| Parameter | Value |
|-----------|-------|
| Account balance (spread bet) | £511.64 |
| Account balance (ISA) | £20,868.50 |
| Risk per trade | 2% (£10.23 spread bet / £417.37 ISA) |
| Platforms to trade | IG only (spread bet + ISA) |

**Note:** Spread bet demo account (£511.64) is small for 2% risk. A single trade at £10 risk may be impractical for most instruments. Consider:
- Using ISA for real trades (£417 risk per trade is workable)
- Or increasing demo account balance for testing
