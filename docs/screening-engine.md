# Screening Engine — Module Reference

The screening engine evaluates watchlist candidates against configurable rules
to surface tickers worth deeper analysis. It also flags "shock stocks" —
companies with strong fundamentals that have been beaten down by price action.

Source modules:

- `src/server/lib/screening-engine.ts` — pure evaluation (no I/O)
- `src/server/lib/screening-data.ts` — database I/O for rules, enrichment, sentiment, history
- `src/cli/commands/screen.ts` — `trading screen ...` CLI surface
- `src/server/routes/screenings.tsx` — `/api/screenings/*` HTTP endpoints
- `src/server/views/screenings-view.tsx` — Screening dashboard tab

## Architecture

```
                              ┌────────────────────────┐
                              │ watchlist (SQLite)     │
                              │ watchlist_enrichment   │
                              │ watchlist_news_sent..  │
                              │ screening_rules        │
                              │ watchlist_screenings   │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │ screening-data.ts      │
                              │   list/get/create rule │
                              │   upsert enrichment    │
                              │   insert sentiment     │
                              │   save history         │
                              └───────────┬────────────┘
                                          │ CandidateData[]
                                          ▼
                              ┌────────────────────────┐
                              │ screening-engine.ts    │
                              │   screenCandidates()   │
                              │   detectShockStocks()  │
                              │   (pure functions)     │
                              └───────────┬────────────┘
                                          │ MatchResult[]
                  ┌───────────────────────┴────────────────────────┐
                  ▼                                                ▼
       ┌────────────────────┐                          ┌────────────────────────┐
       │ src/cli/commands   │                          │ src/server/routes      │
       │  screen.ts         │                          │  screenings.tsx        │
       │  (CLI subcommands) │                          │  (REST + HTMX panels)  │
       └────────────────────┘                          └────────────────────────┘
```

The engine is a pure function: given rules and candidates, it returns matches.
All side effects (DB reads, DB writes, history persistence) live in the data
layer or the callers that orchestrate it.

## Database Schema

Defined in `src/server/lib/schema.sql`. Apply via `trading screen init`.

| Table | Purpose |
| --- | --- |
| `screening_rules` | `id, name, description, enabled, conditions (JSON), priority, created_at, updated_at` |
| `watchlist_enrichment` | Fundamentals per `(ticker, fetch_date)`: `pe_forward, eps_growth_1y, operating_margin, beta_1y, price_to_sales, sector, region, source` |
| `watchlist_news_sentiment` | Headlines: `ticker, published_date, headline_text, summary, sentiment_score (-1..1), source, enrichment_id` |
| `watchlist_screenings` | Run history: `run_date, tickers_matched (JSON), rule_count` |

## Data Layer API — `screening-data.ts`

### Rules

- `listScreeningRules(): ScreeningRule[]` — all rules, ordered by `priority DESC, name ASC`. JSON `conditions` are parsed.
- `getScreeningRule(id): ScreeningRule | null`
- `createScreeningRule(name, conditions, description?, priority = 0): number` — returns the new rule id.
- `deleteScreeningRule(id): boolean`
- `toggleScreeningRule(id, enabled): boolean`

### Enrichment

- `upsertEnrichment(row: Omit<EnrichmentRow, "created_at">): void` — `ON CONFLICT(ticker, fetch_date) DO UPDATE`.
- `getLatestEnrichment(ticker): EnrichmentRow | null`
- `getAllEnrichment(): EnrichmentRow[]`

### Sentiment

- `insertSentiment(row): number` — returns row id.
- `getSentimentForTicker(ticker): SentimentRow[]`
- `getSentimentSummary(ticker): { count, avg_score }`
- `pruneOldSentiment(days = 30): number` — returns rows removed.

### History

- `saveScreeningHistory(tickers, ruleCount): number`
- `getRecentScreenings(limit = 10): Array<{ id, run_date, tickers_matched, rule_count, created_at }>`

## Engine API — `screening-engine.ts`

### `screenCandidates(input: ScreenInput): ScreenResult`

Evaluates candidates against rules.

```ts
interface ScreenInput {
  candidates: CandidateData[]
  rules: ScreeningRule[]
  stageFilter?: string[]   // e.g. ["researching", "analyzed", "candidate"]
}

interface ScreenResult {
  matches: MatchResult[]   // sorted by priority_score DESC
  total_candidates: number
  matched_count: number
  rules_evaluated: number
}
```

Behaviour:

1. Rules with `enabled = 0` are dropped, then sorted by `priority DESC`.
2. If `stageFilter` is provided, candidates whose stage is not in the list are dropped.
3. A rule matches a candidate only if **all** its conditions evaluate true. Missing enrichment makes any condition that needs enrichment fail.
4. `priority_score` is the sum of `(rule.priority + 1)` for each matched rule.
5. `match_reasons` contains one human-readable line per satisfied condition.

### `detectShockStocks(input: ShockStockInput): MatchResult[]`

```ts
interface ShockStockInput {
  candidates: CandidateData[]
  priceDropPct: number  // e.g. 10 = price down >10%
  minMarginPct: number  // e.g. 20 = operating margin >20%
  maxPSRatio: number    // e.g. 5  = price/sales <= 5
}
```

Currently filters on `operating_margin` and `price_to_sales` only; the
`priceDropPct` parameter is wired through for future price-history checks.

### Condition Operators

`ScreenCondition.operator` is one of:

| Operator | Meaning | Notes |
| --- | --- | --- |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison | Returns `false` if the field is non-numeric |
| `eq` | Strict equality | Works on numbers or strings |
| `in` | Membership | `value` must be a string array |
| `bottom_pct`, `top_pct` | Percentile bands | Stubs — return `false` until distribution support lands |

### Supported Fields

`pe_forward`, `eps_growth_1y`, `operating_margin`, `beta_1y`, `price_to_sales`,
`sector`, `region`, `price`, `sentiment_score`. The first seven are read from
`enrichment`; `price` comes from `candidate.current_price`; `sentiment_score`
is the trailing-average from `getSentimentSummary(ticker)`.

## CLI — `trading screen <subcommand>`

The CLI is composed in `src/cli/commands/screen.ts` using `citty`. Every
subcommand calls `DatabaseFactory.connect(cfg.portfolio.db)` first.

### `screen init`

Apply the screening schema to the active database. Idempotent — only creates
tables prefixed `screening_*` or `watchlist_*` that do not already exist.

### `screen create <name>`

Create a new screening rule.

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `<name>` | positional | required | Rule name |
| `--conditions` | string (JSON) | required | JSON array of `ScreenCondition` objects |
| `--description` | string | — | Free-text description |
| `--priority` | integer | `0` | Higher = evaluated first, contributes more to `priority_score` |

Example:

```bash
trading screen create high-growth-cheap \
  --priority 5 \
  --description "Sub-15 forward P/E with >20% EPS growth" \
  --conditions '[
    {"field":"pe_forward","operator":"lt","value":15},
    {"field":"eps_growth_1y","operator":"gt","value":0.20}
  ]'
```

### `screen list`

Print all rules with id, name, conditions (truncated), priority, enabled flag,
and description.

### `screen delete <id>`

Delete the rule with the given numeric id. Exits non-zero if no such rule.

### `screen enrich`

Fetch and upsert fundamental data from Yahoo Finance via a `yfinance` subprocess.

| Flag | Description |
| --- | --- |
| `--ticker <SYM>` | Enrich a single ticker |
| `--all` | Enrich every distinct ticker in the `watchlist` table |

Exactly one of `--ticker` or `--all` is required.

### `screen sentiment`

Fetch headlines for tickers, score them with a keyword-based sentiment
heuristic, and insert into `watchlist_news_sentiment`. Old headlines (>30 days)
are pruned before insertion.

| Flag | Description |
| --- | --- |
| `--ticker <SYM>` | Process a single ticker |
| `--all` | Process every distinct ticker in the watchlist |

Requires prior `screen enrich` for the same ticker (sentiment rows reference
`enrichment_id`).

### `screen run`

Evaluate all enabled rules against non-acquired watchlist candidates and print
a results table. Saves a row in `watchlist_screenings` whenever there is at
least one match.

| Flag | Description |
| --- | --- |
| `--json` | Emit the full `ScreenResult` as JSON instead of the human table |
| `--stage <list>` | Comma-separated stages to filter on (e.g. `researching,candidate`) |

### `screen shock`

Identify candidates with strong fundamentals despite a price drop.

| Flag | Default | Description |
| --- | --- | --- |
| `--drop` | `10` | Minimum price drop %, currently informational |
| `--margin` | `20` | Min operating margin % |
| `--ps` | `5` | Max price-to-sales ratio |
| `--json` | — | Emit JSON instead of the table |

### `screen history`

Print the most recent screening runs.

| Flag | Default | Description |
| --- | --- | --- |
| `--limit` | `10` | Number of rows to display |

## HTTP API — `/api/screenings/*`

Mounted via `screeningsRouter` (Hono). Every endpoint reads from the active
database via `DatabaseFactory.get()`.

| Method | Path | Returns | Query params |
| --- | --- | --- | --- |
| GET | `/api/screenings/results` | JSON `ScreenResult` with `matches[].sentiment_score`, `sentiment_count` | `stage` (csv) |
| GET | `/api/screenings/results/html` | HTMX panel (`<section class="screening-panel">`) | — |
| GET | `/api/screenings/shock` | JSON `{ shockStocks, params }` | `drop`, `margin`, `ps` |
| GET | `/api/screenings/shock/html` | HTMX panel | `margin`, `ps` |
| GET | `/api/screenings/history` | JSON `{ screenings }` | `limit` |
| GET | `/api/screenings/history/html` | HTMX panel | `limit` |
| GET | `/api/screenings/rules` | JSON `{ rules }` | — |

The HTML endpoints render JSX panels intended to be swapped into the Screening
dashboard tab via HTMX.

## Dashboard — `ScreeningsView`

Defined in `src/server/views/screenings-view.tsx`. Renders three lazy-loaded
HTMX panels:

1. **Screening Results** — `/api/screenings/results/html`
2. **Shock Stocks** — `/api/screenings/shock/html`
3. **Screening History** — `/api/screenings/history/html`

Refresh buttons in the page header force a re-fetch via `hx-boost`.

## Weekly Cadence — `just screen-weekly`

The recipe in `Justfile` chains backup → enrich → run → history. See
[`docs/just/screen-recipes.md`](just/screen-recipes.md) for details and the
cron line.

## Example — End-to-end run

```bash
# 1. One-time: install screening tables into the active database
trading screen init

# 2. Define a rule (sub-15 forward P/E, >20% EPS growth)
trading screen create growth-bargain --priority 5 \
  --conditions '[
    {"field":"pe_forward","operator":"lt","value":15},
    {"field":"eps_growth_1y","operator":"gt","value":0.20}
  ]'

# 3. Pull fundamentals for every watchlist candidate
trading screen enrich --all

# 4. Evaluate rules; persists a history row when something matches
trading screen run

# 5. Inspect history
trading screen history --limit 5

# 6. Find beaten-down high-quality names
trading screen shock --margin 25 --ps 4
```
