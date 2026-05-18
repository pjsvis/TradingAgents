# Screening Just Recipes

`just` recipes wrap the `trading screen` CLI for repeatable cadence. Each
recipe is defined in the top-level `Justfile` under the `screen` group.

## `just screen-weekly`

End-to-end weekly screening cycle. Runs backup → enrich → screen → history,
all against the active database.

### Steps

1. `bun scripts/db-backup.ts` — snapshot the current portfolio DB.
2. `bun src/cli/main.ts screen enrich --all` — fetch fundamentals (Yahoo
   Finance via `yfinance`) for every distinct ticker in `watchlist`.
3. `bun src/cli/main.ts screen run` — evaluate all enabled rules and persist
   a row in `watchlist_screenings` whenever there is at least one match.
4. `bun src/cli/main.ts screen history` — print the most recent runs (the
   one we just wrote first).

### Guardrails

The recipe is marked `[confirm("Run weekly screening cycle? ...")]`, so it
prompts before running. Pass `--yes` to bypass when wiring it into cron.

### Cron

The recipe header notes the canonical cron line:

```cron
# Friday 18:00 local, log to ~/.tradingagents/logs/screen-weekly.log
0 18 * * 5 cd /path/to/repo && just --yes screen-weekly >> ~/.tradingagents/logs/screen-weekly.log 2>&1
```

Replace `/path/to/repo` with the absolute path to the working copy. Ensure the
log directory exists; the recipe does not create it.

### Outputs

- A fresh `.bak` next to `portfolio.db` (timestamped — see `scripts/db-backup.ts`).
- Upserted rows in `watchlist_enrichment` keyed by `(ticker, fetch_date)`.
- A new row in `watchlist_screenings` if any rule matched.
- Stdout summary table for both the screening run and the history listing.

### Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `screen enrich` reports `no data available` | `yfinance` returned nothing | Retry; the source is rate-limited. |
| Backup step fails | `portfolio.db` is locked | Stop the dashboard (`just down`) and re-run. |
| `screen run` finds zero matches | No enabled rules, or no enrichment | Run `trading screen list` to confirm rules exist; ensure step 2 succeeded. |

See [`docs/screening-engine.md`](../screening-engine.md) for the full
screening-engine reference.
