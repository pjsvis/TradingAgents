/**
 * GET /api/portfolio/intelligence — unified portfolio view
 *
 * Fuses:
 *   - SQLite accounts (metadata + manual balances for legacy accounts)
 *   - hledger cash balances (authoritative per-account cash for investment platforms)
 *   - SQLite positions with live market prices + P&L
 *   - SQLite spread bet positions with live P&L
 *   - Governance rules (violations + rebalance suggestions)
 *
 * Returns:
 *   - total portfolio value (live prices)
 *   - allocation bar (spread bet / deployed / cash) with target vs actual
 *   - cash breakdown (reserve, spread bet allocation, investable)
 *   - accounts summary table
 *   - positions by account with live P&L
 *   - spread bet positions with live P&L
 *   - research queue (approved stage watchlist)
 *   - governance violations
 */
import { Hono } from "hono"
import { getHoldings } from "../lib/hledger.ts"
import { DatabaseFactory } from "../lib/db.ts"
import { checkRules, suggestRebalance, loadRules } from "../lib/governance.ts"
import { priceCache, endOfToday } from "../lib/cache.ts"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { existsSync } from "node:fs"

export const intelligenceRouter = new Hono()

function findProjectRoot(): string {
  if (process.env.TA_ROOT) return process.env.TA_ROOT
  const projectRoot = dirname(dirname(import.meta.dir))
  if (projectRoot.includes("TradingAgents")) return projectRoot
  return projectRoot
}

interface DbPosition {
  id: number
  ticker: string
  exchange: string
  platform: string
  account_id: string | null
  quantity: number
  avg_cost: number
  entry_date: string
  thesis: string | null
}

interface DbAccount {
  id: string
  provider: string
  account_type: string
  name: string
  balance: number
  currency: string
  notes: string | null
}

interface DbSpreadBet {
  id: number
  account_id: string
  ticker: string
  direction: string
  stake_per_point: number
  entry_price: number
  entry_date: string
  stop_price: number | null
  target_price: number | null
  current_price: number | null
  pnl_gbp: number | null
  status: string
  notes: string | null
}

interface DbWatchlistItem {
  id: number
  ticker: string
  exchange: string
  priority: string
  thesis: string | null
  added_date: string
  last_signal: string | null
}

interface PositionWithValue {
  id: number
  ticker: string
  exchange: string
  platform: string
  account_id: string | null
  quantity: number
  avg_cost: number
  entry_date: string
  thesis: string | null
  current_price_gbp: number | null
  current_value_gbp: number | null
  cost_value_gbp: number
  pnl_gbp: number | null
  pnl_pct: number | null
  currency: string
  account_type?: string
}

interface SpreadBetWithPnl {
  id: number
  account_id: string
  ticker: string
  direction: string
  stake_per_point: number
  entry_price: number
  entry_date: string
  stop_price: number | null
  target_price: number | null
  current_price_gbp: number | null
  current_value_gbp: number | null
  pnl_gbp: number | null
  pnl_pct: number | null
  notional_gbp: number
  status: string
  notes: string | null
}

interface PriceResult { price: number | null; currency: string }

function findVenvPython(): string {
  const root = findProjectRoot()
  // Check review repo venv first
  const reviewVenv = join(root, ".venv", "bin", "python3")
  if (existsSync(reviewVenv)) return reviewVenv
  // Check sibling TradingAgents venv
  const siblingVenv = join(root, "..", "TradingAgents", ".venv", "bin", "python3")
  if (existsSync(siblingVenv)) return siblingVenv
  // Fall back to system python3
  return "python3"
}

async function fetchPriceForTicker(ticker: string): Promise<PriceResult> {
  const now = Date.now()
  const cached = priceCache.get(ticker)
  if (cached && cached.expires > now && cached.price !== null) {
    return { price: cached.price, currency: "USD" }
  }

  return new Promise((resolve) => {
    const root = findProjectRoot()
    const script = join(root, "scripts", "py", "get_price.py")
    if (!existsSync(script)) {
      resolve({ price: null, currency: "USD" })
      return
    }
    const python = findVenvPython()
    const child = spawn(python, [script, ticker], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      timeout: 12_000,
    })
    let stdout = ""
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    child.on("close", () => {
      try {
        const data = JSON.parse(stdout.trim())
        if (data.price != null) {
          priceCache.set(ticker, { price: data.price, expires: endOfToday() })
        }
        resolve({ price: data.price ?? null, currency: data.currency ?? "USD" })
      } catch {
        resolve({ price: null, currency: "USD" })
      }
    })
    child.on("error", () => resolve({ price: null, currency: "USD" }))
  })
}

async function fetchPrices(tickers: string[]): Promise<Map<string, PriceResult>> {
  const results = new Map<string, PriceResult>()
  if (tickers.length === 0) return results

  const settled = await Promise.all(
    tickers.map(
      (t) =>
        new Promise<[string, PriceResult]>((resolve) => {
          fetchPriceForTicker(t).then((r) => resolve([t, r]))
        }),
    ),
  )
  for (const [ticker, data] of settled) results.set(ticker, data)
  return results
}

// ── Asset classification helpers ─────────────────────────────────────────────

function classifyTicker(ticker: string, exchange: string): string {
  const t = ticker.toUpperCase()
  if (t === "VWCE.DE" || t === "IWDA.L" || t === "CSPX.L" || t === "TERA.SW") return "etf"
  if (exchange === "CRYPTO" || ["BTC", "ETH", "SOL", "XRP"].includes(t)) return "crypto"
  return "equity"
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ── Allocation targets (from governance) ────────────────────────────────────

const ALLOCATION_TARGETS = {
  cash_reserve_pct: 10,    // minimum cash floor (%)
  spreadbet_pct: 20,       // max spread bet allocation (%)
  deployed_pct: 70,        // max deployed (%)
}

// ── Main endpoint ────────────────────────────────────────────────────────────

intelligenceRouter.get("/", async (c) => {
  try {
    const db = DatabaseFactory.get()

    // 1. Fetch hledger cash (authoritative for investment accounts)
    const { holdings: hlHoldings, cash: hlCash } = await getHoldings()

    // 2. Fetch accounts from SQLite
    const accounts = db.query("SELECT * FROM accounts").all() as DbAccount[]
    const accountsById = new Map<string, DbAccount>(accounts.map((a) => [a.id, a]))

    // 3. Fetch positions with account linkage
    const dbPositions = db.query(
      "SELECT id, ticker, exchange, platform, account_id, quantity, avg_cost, entry_date, thesis FROM positions WHERE status = 'open'",
    ).all() as DbPosition[]

    // 4. Fetch spread bet positions
    const dbBets = db.query(
      "SELECT * FROM spreadbet_positions WHERE status = 'open'",
    ).all() as DbSpreadBet[]

    // 5. Fetch approved watchlist items (research queue)
    const researchQueue = db.query(
      "SELECT id, ticker, exchange, priority, thesis, added_date, last_signal FROM watchlist WHERE stage = 'approved' ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
    ).all() as DbWatchlistItem[]

    // 6. Compute live prices for all tickers + FX pairs
    const posTickers = [...new Set(dbPositions.map((p) => p.ticker))]
    const betTickers = [...new Set(dbBets.map((b) => b.ticker))]
    const fxPairs = ["GBPEUR=X", "GBPUSD=X"]
    const allNeeded = [...new Set([...posTickers, ...betTickers]), ...fxPairs]
    const prices = await fetchPrices(allNeeded)

    const gbpeur = prices.get("GBPEUR=X")?.price ?? 1.18
    const gbpUSD = prices.get("GBPUSD=X")?.price ?? 1.27
    const gbpPerEur = 1 / gbpeur
    const gbpPerUsd = 1 / gbpUSD

    // 7. Build positions with live values + account type
    const positionsWithValue: PositionWithValue[] = dbPositions.map((p) => {
      const pd = prices.get(p.ticker)
      let currentPriceGbp: number | null = null
      if (pd?.price != null) {
        if (pd.currency === "EUR") currentPriceGbp = pd.price * gbpPerEur
        else if (pd.currency === "USD") currentPriceGbp = pd.price * gbpPerUsd
        else currentPriceGbp = pd.price
      }

      let costValueGbp = p.avg_cost * p.quantity
      if (p.exchange === "US") costValueGbp = (p.avg_cost * p.quantity) / gbpUSD
      else if (p.exchange === "XETRA" || p.exchange === "EUR") costValueGbp = (p.avg_cost * p.quantity) / gbpeur

      const currentValueGbp = currentPriceGbp != null ? currentPriceGbp * p.quantity : null
      const pnlGbp = currentValueGbp != null ? currentValueGbp - costValueGbp : null
      const pnlPct = costValueGbp > 0 && pnlGbp != null ? (pnlGbp / costValueGbp) * 100 : null

      const account = p.account_id ? accountsById.get(p.account_id) : null

      return {
        ...p,
        current_price_gbp: currentPriceGbp != null ? round2(currentPriceGbp) : null,
        current_value_gbp: currentValueGbp != null ? round2(currentValueGbp) : null,
        cost_value_gbp: round2(costValueGbp),
        pnl_gbp: pnlGbp != null ? round2(pnlGbp) : null,
        pnl_pct: pnlPct != null ? round2(pnlPct) : null,
        currency: pd?.currency ?? "GBP",
        account_type: account?.account_type,
      }
    })

    // 8. Build spread bet positions with live P&L
    // Note: spread bet entry_price is in the quote currency (USD for crypto/US equity).
    // We convert to GBP for all P&L and notional calculations.
    const spreadBetsWithPnl: SpreadBetWithPnl[] = dbBets.map((b) => {
      const pd = prices.get(b.ticker)
      // Convert current price to GBP
      let currentPriceGbp: number | null = null
      if (pd?.price != null) {
        if (pd.currency === "EUR") currentPriceGbp = pd.price * gbpPerEur
        else if (pd.currency === "USD") currentPriceGbp = pd.price / gbpUSD  // divide: USD price → GBP
        else currentPriceGbp = pd.price
      }

      // Entry price in GBP (assume USD quote for crypto/US assets)
      const entryPriceGbp = b.entry_price / gbpUSD
      const notionalGbp = entryPriceGbp * b.stake_per_point

      // P&L = direction × stake × price_delta_GBP
      let pnlGbp: number | null = null
      if (currentPriceGbp != null) {
        const priceDeltaGbp = currentPriceGbp - entryPriceGbp
        pnlGbp = b.direction === "long"
          ? priceDeltaGbp * b.stake_per_point
          : -priceDeltaGbp * b.stake_per_point
      }

      return {
        ...b,
        current_price_gbp: currentPriceGbp != null ? round2(currentPriceGbp) : null,
        current_value_gbp: currentPriceGbp != null ? round2(currentPriceGbp) : null,
        pnl_gbp: pnlGbp != null ? round2(pnlGbp) : null,
        pnl_pct: notionalGbp > 0 && pnlGbp != null
          ? round2((pnlGbp / notionalGbp) * 100)
          : null,
        notional_gbp: round2(notionalGbp),
      }
    })

    // 9. Account-level aggregation (cash + deployed + spread bet)
    const accountValues = new Map<string, {
      account: DbAccount;
      cash_gbp: number;
      deployed_gbp: number;
      spreadbet_gbp: number;
      positions: PositionWithValue[];
      bets: SpreadBetWithPnl[];
    }>()

    // Initialize all accounts from SQLite
    for (const acc of accounts) {
      accountValues.set(acc.id, {
        account: acc,
        cash_gbp: acc.balance, // manual balance for legacy/savings accounts
        deployed_gbp: 0,
        spreadbet_gbp: 0,
        positions: [],
        bets: [],
      })
    }

    // Merge hledger cash into investment accounts
    for (const c of hlCash) {
      // Map hledger platform to account_id
      // hledger uses asset types like "degiero", "ibkr" — map to ig-* accounts
      const platformToAccountId: Record<string, string> = {
        degiero: "ig-isa",
        "ig-shares": "ig-shares",
        ibkr: "ig-shares",
        pension: "aviva",
        savings: "cash-other",
        test: "ig-isa",
      }
      const accountId = platformToAccountId[c.platform] ?? c.platform

      if (!accountValues.has(accountId)) continue

      let amountGbp = c.amount
      if (c.currency === "EUR") amountGbp = c.amount * gbpPerEur
      else if (c.currency === "USD") amountGbp = c.amount * gbpPerUsd

      const av = accountValues.get(accountId)!
      av.cash_gbp += amountGbp
    }

    // Assign positions to accounts
    for (const p of positionsWithValue) {
      const accountId = p.account_id ?? (p.platform === "test" ? "ig-isa" : "ig-shares")
      const av = accountValues.get(accountId)
      if (av) {
        av.deployed_gbp += p.current_value_gbp ?? p.cost_value_gbp
        av.positions.push(p)
      }
    }

    // Assign spread bets to accounts
    for (const b of spreadBetsWithPnl) {
      const av = accountValues.get(b.account_id)
      if (av) {
        // For allocation: use notional (capital at risk = entry_price × stake)
        av.spreadbet_gbp += b.notional_gbp
        av.bets.push(b)
      }
    }

    // 10. Compute portfolio totals
    let totalCashGbp = 0
    let totalDeployedGbp = 0
    let totalSpreadBetGbp = 0
    for (const av of accountValues.values()) {
      totalCashGbp += av.cash_gbp
      totalDeployedGbp += av.deployed_gbp
      totalSpreadBetGbp += av.spreadbet_gbp
    }

    // Cash = total - deployed - spreadbet (can be negative if oversold in hledger)
    const cashGbp = totalCashGbp
    const absPortfolioGbp = Math.abs(totalDeployedGbp + totalSpreadBetGbp + cashGbp)
    const totalPortfolioGbp = totalDeployedGbp + totalSpreadBetGbp + cashGbp

    const cashPct = absPortfolioGbp > 0 ? (cashGbp / absPortfolioGbp) * 100 : 0
    const deployedPct = absPortfolioGbp > 0 ? (totalDeployedGbp / absPortfolioGbp) * 100 : 0
    const spreadBetPct = absPortfolioGbp > 0 ? (totalSpreadBetGbp / absPortfolioGbp) * 100 : 0

    // 11. Allocation bar (target vs actual)
    const allocationBar = {
      targets: {
        cash_reserve_pct: ALLOCATION_TARGETS.cash_reserve_pct,
        spreadbet_pct: ALLOCATION_TARGETS.spreadbet_pct,
        deployed_pct: ALLOCATION_TARGETS.deployed_pct,
      },
      actual: {
        cash_pct: round2(cashPct),
        spreadbet_pct: round2(spreadBetPct),
        deployed_pct: round2(deployedPct),
      },
      buckets: [
        { bucket: "cash", label: "Cash", value_gbp: round2(Math.abs(cashGbp)), actual_pct: round2(cashPct), target_pct: ALLOCATION_TARGETS.cash_reserve_pct, color: "#3b82f6" },
        { bucket: "deployed", label: "Deployed", value_gbp: round2(totalDeployedGbp), actual_pct: round2(deployedPct), target_pct: ALLOCATION_TARGETS.deployed_pct, color: "#22c55e" },
        { bucket: "spreadbet", label: "Spread Bet", value_gbp: round2(totalSpreadBetGbp), actual_pct: round2(spreadBetPct), target_pct: ALLOCATION_TARGETS.spreadbet_pct, color: "#eab308" },
      ],
    }

    // 12. Cash breakdown (governance targets)
    const cashReserveTarget = (ALLOCATION_TARGETS.cash_reserve_pct / 100) * absPortfolioGbp
    const spreadBetTarget = (ALLOCATION_TARGETS.spreadbet_pct / 100) * absPortfolioGbp
    const investableCash = Math.max(0, cashGbp - cashReserveTarget)

    const cashBreakdown = {
      total_cash_gbp: round2(Math.abs(cashGbp)),
      cash_negative: cashGbp < 0,
      reserve_gbp: round2(cashReserveTarget),
      reserve_pct: ALLOCATION_TARGETS.cash_reserve_pct,
      spreadbet_allocation_gbp: round2(spreadBetTarget),
      spreadbet_allocation_pct: ALLOCATION_TARGETS.spreadbet_pct,
      investable_gbp: round2(investableCash),
      investable_pct: absPortfolioGbp > 0 ? round2((investableCash / absPortfolioGbp) * 100) : 0,
    }

    // 13. Asset class allocation (for existing view compatibility)
    const etfValueGbp = positionsWithValue
      .filter((p) => classifyTicker(p.ticker, p.exchange) === "etf")
      .reduce((s, p) => s + (p.current_value_gbp ?? p.cost_value_gbp), 0)
    const equityValueGbp = positionsWithValue
      .filter((p) => classifyTicker(p.ticker, p.exchange) === "equity")
      .reduce((s, p) => s + (p.current_value_gbp ?? p.cost_value_gbp), 0)
    const cryptoValueGbp = positionsWithValue
      .filter((p) => classifyTicker(p.ticker, p.exchange) === "crypto")
      .reduce((s, p) => s + (p.current_value_gbp ?? p.cost_value_gbp), 0)

    const assetClassAllocation = [
      { assetClass: "cash", value_gbp: round2(Math.abs(cashGbp)), weight_pct: round2(Math.abs(cashPct)) },
      { assetClass: "equity", value_gbp: round2(equityValueGbp), weight_pct: absPortfolioGbp > 0 ? round2((equityValueGbp / absPortfolioGbp) * 100) : 0 },
      { assetClass: "etf", value_gbp: round2(etfValueGbp), weight_pct: absPortfolioGbp > 0 ? round2((etfValueGbp / absPortfolioGbp) * 100) : 0 },
      { assetClass: "crypto", value_gbp: round2(cryptoValueGbp), weight_pct: absPortfolioGbp > 0 ? round2((cryptoValueGbp / absPortfolioGbp) * 100) : 0 },
    ].filter((a) => a.value_gbp > 0)

    // 14. Accounts summary (for the accounts table view)
    const accountsSummary = [...accountValues.values()].map((av) => ({
      id: av.account.id,
      provider: av.account.provider,
      account_type: av.account.account_type,
      name: av.account.name,
      balance_gbp: round2(av.cash_gbp),
      deployed_gbp: round2(av.deployed_gbp),
      spreadbet_gbp: round2(av.spreadbet_gbp),
      total_value_gbp: round2(av.cash_gbp + av.deployed_gbp + av.spreadbet_gbp),
      positions_count: av.positions.length,
      bets_count: av.bets.length,
      notes: av.account.notes,
    }))

    // 15. Governance (overall portfolio)
    const rules = loadRules()
    const overallAllocations = positionsWithValue.map((p) => ({
      ticker: p.ticker,
      value: p.current_value_gbp ?? p.cost_value_gbp,
      weight: absPortfolioGbp > 0 ? ((p.current_value_gbp ?? p.cost_value_gbp) / absPortfolioGbp) * 100 : 0,
    }))
    const overallViolations = checkRules(overallAllocations, cashPct, totalPortfolioGbp, totalPortfolioGbp, rules)
    const overallSuggestions = suggestRebalance(overallAllocations, cashPct, rules)

    return c.json({
      portfolio: {
        total_value_gbp: round2(totalPortfolioGbp),
        cash_gbp: round2(cashGbp),
        cash_negative: cashGbp < 0,
        deployed_gbp: round2(totalDeployedGbp),
        spreadbet_gbp: round2(totalSpreadBetGbp),
        position_value_gbp: round2(totalDeployedGbp),
        positions_count: positionsWithValue.length,
      },
      fx_rates: {
        GBPEUR: round4(gbpeur),
        GBPUSD: round4(gbpUSD),
      },
      allocation_bar: allocationBar,
      cash_breakdown: cashBreakdown,
      accounts: accountsSummary.sort((a, b) => b.total_value_gbp - a.total_value_gbp),
      platforms: [], // kept for backward compat — accounts replaces this
      asset_classes: assetClassAllocation,
      spreadbets: spreadBetsWithPnl,
      research_queue: researchQueue,
      governance: {
        violations: overallViolations,
        suggestions: overallSuggestions,
      },
    })
  } catch (e: unknown) {
    return c.json(
      { error: "Portfolio intelligence failed", detail: (e as Error).message },
      500,
    )
  }
})