# Data Sources

> **Purpose:** Single source of truth for every financial data source the project uses, has evaluated, or has rejected. Each entry carries the *reason* — not just the status.
>
> **Last reviewed:** 2026-07-30

---

## Architecture: Two Data Layers

The project has two distinct data consumers, and a source's relevance depends on which layer you're touching:

| Layer | Language | Sources | Rule |
|-------|----------|---------|------|
| **Analysis pipeline** (`tradingagents/`) | Python | yfinance, Alpha Vantage, Reddit, StockTwits, Defuddle | **Never fork or modify.** The Python package is upstream-scoped. Data source changes here mean changing `default_config.data_vendors` — a config knob, not a code fork. |
| **Dashboard server** (`src/server/`) | TypeScript | Twelve Data, yfinance (via subprocess) | The insertion point for any new TS-native source. Price route already runs a fallback chain: Twelve Data → yfinance subprocess. |

The dashboard wraps the Python package via subprocess only (`scripts/py/analyze_stream.py`). The two layers share no data-source code.

---

## Active Integrations

### yfinance — Python package

| | |
|---|---|
| **Status** | Active — primary source for the analysis pipeline |
| **Used by** | `tradingagents/dataflows/y_finance.py`, `scripts/py/get_price.py` |
| **Cost** | Free |
| **Coverage** | US equities, ETFs, crypto, forex, EU/UK/Asia with suffix mapping (`.DE`, `.L`, etc.) |
| **History** | Full available history (decades for US) |
| **Rate limits** | Unofficial — HTTP 429s under load, no SLA |
| **Config knob** | `default_config.data_vendors.* = "yfinance"` (default for all four categories) |

**Why it's here:** Free, comprehensive, and already wired into the upstream Python package. The default config routes all four data categories (core stock, technicals, fundamentals, news) to yfinance.

**Why it stays:** The AGENTS.md hard rule — *never fork or modify `tradingagents/` core logic* — means yfinance is the analysis pipeline's native source. Replacing it would require forking the Python package, which is explicitly forbidden. The dashboard's price route uses it only as a subprocess fallback for non-US tickers.

**Known pain:** HTTP 429 rate limits under repeated or batch use. Non-US ticker availability is inconsistent. No SLA — Yahoo can change the unofficial API at any time.

---

### Alpha Vantage — REST API (Python)

| | |
|---|---|
| **Status** | Active — secondary source, configurable via `data_vendors` |
| **Used by** | `tradingagents/dataflows/alpha_vantage_*.py` (stock, fundamentals, indicator, news, common) |
| **Cost** | Free tier (25 requests/day, 5/min); Premium from $49.99/mo |
| **Coverage** | US & global equities, forex, crypto |
| **Key env** | `ALPHA_VANTAGE_API_KEY` |
| **Config knob** | `default_config.data_vendors.* = "alpha_vantage"` (optional override per category) |

**Why it's here:** Provides fundamentals, technical indicators, and news that complement yfinance. The dataflows layer routes to it via the `data_vendors` config — no code change needed to switch a category from yfinance to Alpha Vantage.

**Why it stays:** Free tier covers low-volume use. The upstream package already handles `AlphaVantageRateLimitError` and applies a look-ahead filter on fundamentals (upstream commit `3570f2e`). It's the configured alternative when yfinance fails.

**Known pain:** Free tier is tight (25 calls/day). Fundamentals have a look-ahead bias that the upstream code filters — a subtle correctness concern that's handled, not eliminated.

---

### Twelve Data — REST API (TypeScript, dashboard-native)

| | |
|---|---|
| **Status** | Active — dashboard's primary price source for US tickers |
| **Used by** | `src/server/lib/twelvedata.ts`, `src/server/routes/prices.ts` |
| **Cost** | Free tier: 800 calls/day, 8 credits/min. Batch = 1 credit regardless of ticker count. |
| **Coverage** | US equities (free), forex, crypto. Non-US requires Grow plan. |
| **Key env** | `TWELVEDATA_API_KEY` (commented out in `.env.example`) |
| **History** | Not used for history — real-time quotes only |

**Why it's here:** The dashboard's price route (`GET /api/prices/:ticker`) tries Twelve Data first for US tickers — it's a direct TypeScript `fetch()`, no Python subprocess, no venv latency. The batch endpoint (`/quote` with comma-joined symbols) fetches all US tickers in one API call.

**Why it stays:** It's the only TS-native source. Free tier is generous enough for a personal dashboard (800 calls/day). Falls back to yfinance subprocess silently when Twelve Data is unconfigured or the ticker is non-US.

**Known pain:** Free tier is US-only. EU/UK/crypto tickers skip Twelve Data entirely and hit the yfinance subprocess. The `.env.example` entry is commented out — the source is opt-in.

---

### Reddit & StockTwits — sentiment (Python)

| | |
|---|---|
| **Status** | Active — sentiment signals for the analysis pipeline |
| **Used by** | `tradingagents/dataflows/reddit.py`, `tradingagents/dataflows/stocktwits.py` |
| **Cost** | Free (Reddit API rate-limited; StockTwits public) |
| **Coverage** | Social sentiment, ticker-specific discussion |

**Why they're here:** Upstream package components. The analysis pipeline uses them for crowd-sentiment signals alongside price/fundamental data. Not configurable via `data_vendors` — always available as tools.

---

### Defuddle — article content extraction (Python)

| | |
|---|---|
| **Status** | Active — deep content extraction for analysis |
| **Used by** | `tradingagents/dataflows/defuddle.py` |
| **Cost** | Free |

**Why it's here:** The upstream package uses Defuddle to pull clean article content from URLs found in news feeds, giving the analysis pipeline full-text context rather than just headlines.

---

## Evaluated, Not Integrated

### EODHD (End-of-Day Historical Data) — REST API + official TypeScript SDK

| | |
|---|---|
| **Status** | **Not integrated.** No code, no env var, no `eodhd.ts` file exists. The old version of this doc listed it as "In progress" — that was aspirational; no implementation was ever written. |
| **SDK** | `eodhd` npm package v1.0.1 — MIT, zero runtime deps, Bun-compatible, Node ≥20, fully typed (`EODHDClient`, `EodDataPoint`, `RealTimeQuote`, etc.) |
| **Coverage** | 150,000+ tickers, 70+ exchanges, 30+ years history. Stocks, ETFs, forex, crypto, funds, indices, bonds. |
| **Free tier** | 20 API calls/day, past year only, 6 demo tickers (AAPL, TSLA, VTI, AMZN, MCD, BTC-USD) |
| **Paid plans** | EOD All World $19.99/mo (100k calls/day, 30+ yr history) · EOD+Intraday $29.99/mo · Fundamentals $59.99/mo · All-In-One $99.99/mo (bundles EOD + fundamentals + calendar + bonds) |
| **Rate limits** | 1,000 requests/min on all paid plans |
| **Unique capabilities** | Insider transactions (SEC Form 4), screener API, WebSocket real-time, macro indicators, 20+ server-side technical indicators, S&P Global index constituents (marketplace) |
| **Brief** | `briefs/eodhd-pricing-brief.md` (draft, never executed) |
| **Reference** | `docs/momentum-trading-with-eodhd.md` (third-party article) |

**What EODHD would replace:**
- yfinance pricing in the dashboard (via typed SDK, no subprocess) — *dashboard layer only*
- Alpha Vantage fundamentals (deeper data, higher cost)
- `stockstats_utils` technical indicators (server-side computed by EODHD)

**What EODHD would add (net-new):**
- Insider transactions (SEC Form 4) — no free source provides this reliably
- Screener API — momentum/fundamentals screening for the Prospects pipeline
- WebSocket real-time feeds — not available from yfinance or Alpha Vantage free tiers
- Macro indicators (GDP, inflation, unemployment)
- 70+ exchange coverage with consistent ticker formatting (`SYMBOL.EXCHANGE`)

**What EODHD cannot replace:**
- yfinance/Alpha Vantage inside `tradingagents/` — the Python package is upstream-scoped and natively uses those sources. AGENTS.md forbids forking core logic. EODHD integration is dashboard-layer only.

#### Opinion: Is EODHD worth integrating?

**Verdict: No — not now. Conditional Phase 2, triggered by specific pain.**

The case for EODHD is real but narrow. The SDK is genuinely well-built — MIT, zero deps, Bun-native, fully typed, with retry and rate-limit handling built in. If the project were starting from scratch and wanted a single paid data source, EODHD would be the right choice. But the project is not starting from scratch, and the question is not "is EODHD good?" but "does integrating it reduce entropy?"

**Against:**

1. **The Derrida question (should this be in our consideration set?):** The project is a personal trading research dashboard, not a commercial SaaS. EODHD's commercial pricing is enterprise ("by request"). The personal-use license is permitted, but $99.99/mo ($1,200/year) for the All-In-One plan that covers fundamentals + insider + technicals is a serious recurring cost for a personal tool. The minimum useful plan (EOD All World, $19.99/mo) covers only EOD prices — everything the free stack already provides.

2. **The moat question (can you name your secrets?):** The project's differentiation is the agent-based analysis pipeline — the multi-analyst debate, risk router, regime engine. Data sources are commodities. Swapping yfinance for EODHD doesn't improve analysis quality; it improves data *reliability*. That's a maintenance cost reduction, not a capability gain, and it's hard to justify $240–$1,200/year for fewer HTTP 429s.

3. **Overlap:** EODHD's EOD + fundamentals + news + technicals overlap almost entirely with the existing free stack (yfinance + Alpha Vantage + Twelve Data). The only *net-new* capabilities are insider transactions, screener, WebSocket, and macro. Of those, only insider transactions and screener are plausibly useful — and `tradingagents/dataflows` already has `get_insider_transactions` from both yfinance and Alpha Vantage (free).

4. **The silo rule:** EODHD can only integrate at the dashboard (TS) layer. The analysis pipeline (Python) is locked to yfinance/Alpha Vantage by the no-fork rule. So EODHD would improve the dashboard's price route — which already works via Twelve Data + yfinance fallback. The marginal gain is replacing a working fallback chain with a paid SDK.

**For (the narrow case):**

1. **Insider transactions are genuinely unique** — if the project commits to insider-signal analysis as a feature, EODHD's Form 4 data is the reliable path. But that's a *feature* decision, not a data-source decision, and the feature isn't currently built.

2. **The screener is the second compelling capability** — if the Prospects pipeline needs a real momentum/fundamentals screener, `client.screener()` is purpose-built. But the Prospects pipeline doesn't currently use a screener.

3. **yfinance reliability** — if HTTP 429s become a persistent dashboard disruption, EODHD's $19.99/mo EOD plan is a clean reliability upgrade with a typed SDK and 70-exchange coverage. The SDK eliminates the Python subprocess for pricing entirely.

**Trigger conditions for integration:**

| Condition | Plan needed | Cost |
|-----------|-------------|------|
| yfinance 429s disrupt the dashboard weekly+ | EOD All World | $19.99/mo |
| Insider-transaction signals become a committed feature | All-In-One | $99.99/mo |
| Prospects pipeline needs a real screener | EOD All World (screener included) | $19.99/mo |
| Real-time WebSocket feeds needed | All-In-One + intraday | $99.99/mo+ |

Until one of these fires, the free stack is **predictably adequate**: yfinance + Alpha Vantage (Python pipeline) + Twelve Data (dashboard pricing) covers the current surface area at zero recurring cost. EODHD is the right *next* source if the project outgrows the free tier — but the project hasn't outgrown it yet.

---

## Archived (Evaluated and Rejected)

### Meyka

| | |
|---|---|
| **URL** | meyka.com |
| **Evaluated** | 2026-05-19 |
| **Reason** | AI chatbot API only — not a structured data endpoint. EODHD already covers insider transactions via `client.insiderTransactions()`. Pay-per-token model adds cost without adding data. |
| **Doc** | `docs/meyka-insider-tracker.md` |

### secfilingdata.com

| | |
|---|---|
| **URL** | api.secfilingdata.com |
| **Evaluated** | 2026-05-19 |
| **Reason** | Raw SEC Form 4 API — no SDK, no Bun/TypeScript wrapper. EODHD covers this with a typed SDK method. |

---

## Local Tools (Not Data Sources)

| Tool | Path | Purpose |
|------|------|---------|
| **kpdf** | `scripts/kpdf.ts` | PDF extraction CLI (Bun + `@kreuzberg/node`). Markdown, JSON, text output. |
| **kreuzberg** | npm binary | Full Kreuzberg CLI. `kreuzberg mcp` for MCP server mode (stdio, JSON-RPC 2.0). |

---

## Decision Framework

When evaluating a new data source, apply this filter **before** drafting a brief:

1. **The Derrida question:** Should a paid/commercial source even be in the consideration set for a personal research tool? Ask this *before* evaluating quality.
2. **The moat question:** Does this source add a *capability* the project doesn't have, or does it just replace a free source with a paid one? Capability = integrate. Replacement = only on persistent pain.
3. **Does it overlap with the free stack?** (yfinance + Alpha Vantage + Twelve Data). If >70% overlap, the net-new surface must justify the cost alone.
4. **Which layer?** Dashboard (TS) — can integrate freely. Analysis pipeline (Python) — locked by the no-fork rule; only `data_vendors` config changes are allowed.
5. **Is there a typed SDK for Bun/TypeScript?** Preferred over raw REST + manual parsing. The `eodhd` SDK is the gold standard here.
6. **Is there a free tier for testing?** Required before any CI integration.
7. **Is the secret stored in Skate?** Required before production use.

---

## Environment Variables

| Variable | Source | Status | Notes |
|----------|--------|--------|-------|
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage | Active | Python dataflows |
| `TWELVEDATA_API_KEY` | Twelve Data | Optional (commented in `.env.example`) | Dashboard pricing |
| `EODHD_API_KEY` | EODHD | **Not set** | Would be needed if EODHD is integrated |
| `OPENROUTER_API_KEY` | OpenRouter | Active | LLM routing for PR summarize + analyses |
| `OPENAI_API_KEY` | OpenAI | Active | LLM clients |
| `ANTHROPIC_API_KEY` | Anthropic | Active | LLM clients |
| `XAI_API_KEY` | xAI | Active | LLM clients |
| `DEEPSEEK_API_KEY` | DeepSeek | Active | LLM clients |

> LLM API keys are not financial data sources but are listed here for completeness of the env inventory.
