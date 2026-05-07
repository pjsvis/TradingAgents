import { defineCommand } from "citty"
import { DatabaseFactory } from "../../../server/lib/db.ts"
import { calculateTradePlan, type PriceBar } from "../../../server/lib/trade-calculator.ts"
import { getPlatform, type TradeMode, validateMode } from "../lib/platforms.ts"

// ── Types ───────────────────────────────────────────────────────────────────

interface PriceRow {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ── Data fetching ───────────────────────────────────────────────────────────

function fetchPriceHistory(ticker: string): PriceBar[] {
  const dbPath = process.env.PORTFOLIO_DB ?? "./portfolio.db"
  DatabaseFactory.connect(dbPath)
  const db = DatabaseFactory.get()

  const rows = db
    .query(
      `SELECT date, open, high, low, close, volume
     FROM prices
     WHERE ticker = ?
     ORDER BY date ASC`,
    )
    .all(ticker) as Array<{
    date: string
    open: number | string
    high: number | string
    low: number | string
    close: number | string
    volume: number | string
  }>

  if (rows.length === 0) {
    throw new Error(`No price history for ${ticker}. Run: trading sync --ticker ${ticker}`)
  }

  return rows.map((r) => ({
    date: r.date,
    open: parseFloat(String(r.open)),
    high: parseFloat(String(r.high)),
    low: parseFloat(String(r.low)),
    close: parseFloat(String(r.close)),
    volume: parseInt(String(r.volume), 10),
  }))
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function rr(plan: ReturnType<typeof calculateTradePlan>): string {
  const risk = plan.entry - plan.stopLoss
  const reward = plan.target2 - plan.entry
  return risk > 0 ? (reward / risk).toFixed(2) : "—"
}

// ── Renderers ───────────────────────────────────────────────────────────────

function renderShares(plan: ReturnType<typeof calculateTradePlan>): void {
  const platform = getPlatform("ig")! // default fallback for shares
  const notional = plan.positionSize * plan.entry
  const stampDuty = notional * platform.stampDuty
  const commission = platform.commission ?? 0
  const totalCost = notional + stampDuty + commission

  console.log(`┌─────────────────┬────────────────────────────────────┐`)
  console.log(`│ Ticker          │ ${plan.ticker.padEnd(34)} │`)
  console.log(`│ Mode            │ ${"Shares".padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Entry           │ $${fmt(plan.entry).padEnd(32)} │`)
  console.log(`│ Stop Loss       │ $${fmt(plan.stopLoss).padEnd(32)} │`)
  console.log(`│ Target 1        │ $${fmt(plan.target1).padEnd(32)} │`)
  console.log(`│ Target 2        │ $${fmt(plan.target2).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Position Size   │ ${(String(plan.positionSize) + " shares").padEnd(34)} │`)
  console.log(`│ Notional        │ £${fmt(notional).padEnd(32)} │`)
  if (platform.stampDuty > 0) {
    console.log(`│ Stamp Duty      │ £${fmt(stampDuty).padEnd(32)} │`)
  }
  if (commission > 0) {
    console.log(`│ Commission      │ £${fmt(commission).padEnd(32)} │`)
  }
  console.log(`│ Total Cost      │ £${fmt(totalCost).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Risk Amount     │ £${fmt(plan.riskAmount).padEnd(32)} │`)
  console.log(
    `│ Risk %          │ ${(String((plan.riskPercent * 100).toFixed(2)) + "% of account").padEnd(34)} │`,
  )
  console.log(`│ R/R Ratio       │ ${(rr(plan) + ":1").padEnd(34)} │`)
  console.log(`│ ATR (14d)       │ ${String(plan.atr14.toFixed(4)).padEnd(34)} │`)
  console.log(`└─────────────────┴────────────────────────────────────┘`)

  console.log(``)
  console.log(`Bracket Order:`)
  console.log(`  BUY  ${plan.positionSize} @ $${plan.entry} (Limit)`)
  console.log(
    `  → SELL ${Math.floor(plan.positionSize / 2)} @ $${plan.target1} (Limit GTC)  [50% at T1]`,
  )
  console.log(
    `  → SELL ${plan.positionSize - Math.floor(plan.positionSize / 2)} @ $${plan.target2} (Limit GTC)  [remainder at T2]`,
  )
  console.log(`  → STOP ${plan.positionSize} @ $${plan.stopLoss} (Stop-Limit)`)
}

function renderSpreadBet(
  plan: ReturnType<typeof calculateTradePlan>,
  accountBalance: number,
  riskPerTrade: number,
): void {
  const platform = getPlatform("ig")!
  if (!platform.marginFactor || !platform.overnightRate) return

  const riskAmount = accountBalance * riskPerTrade
  const stopDistance = plan.entry - plan.stopLoss
  const stake = stopDistance > 0 ? riskAmount / stopDistance : 0
  const notional = stake * plan.entry
  const margin = notional * platform.marginFactor
  const overnight = (notional * platform.overnightRate) / 365

  console.log(`┌─────────────────┬────────────────────────────────────┐`)
  console.log(`│ Ticker          │ ${plan.ticker.padEnd(34)} │`)
  console.log(`│ Mode            │ ${"Spread Bet".padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Entry           │ $${fmt(plan.entry).padEnd(32)} │`)
  console.log(`│ Stop Loss       │ $${fmt(plan.stopLoss).padEnd(32)} │`)
  console.log(`│ Stop Distance   │ ${(String(stopDistance.toFixed(2)) + " points").padEnd(34)} │`)
  console.log(`│ Target 1        │ $${fmt(plan.target1).padEnd(32)} │`)
  console.log(`│ Target 2        │ $${fmt(plan.target2).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Stake           │ £${fmt(stake).padEnd(32)} / point │`)
  console.log(`│ Notional        │ £${fmt(notional).padEnd(32)} │`)
  console.log(`│ Margin Required │ £${fmt(margin).padEnd(32)} │`)
  console.log(`│ Overnight Fin.  │ ~£${fmt(overnight).padEnd(31)} / day │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Risk Amount     │ £${fmt(riskAmount).padEnd(32)} │`)
  console.log(
    `│ Risk %          │ ${(String((riskPerTrade * 100).toFixed(2)) + "% of account").padEnd(34)} │`,
  )
  console.log(`│ R/R Ratio       │ ${(rr(plan) + ":1").padEnd(34)} │`)
  console.log(`│ ATR (14d)       │ ${String(plan.atr14.toFixed(4)).padEnd(34)} │`)
  console.log(`└─────────────────┴────────────────────────────────────┘`)

  console.log(``)
  console.log(`Bracket Order:`)
  console.log(`  OPEN £${fmt(stake)}/pt @ $${plan.entry} (Buy)`)
  console.log(`  → CLOSE £${fmt(stake)}/pt @ $${plan.target1} (Take Profit)  [50% at T1]`)
  console.log(`  → CLOSE £${fmt(stake)}/pt @ $${plan.target2} (Take Profit)  [remainder at T2]`)
  console.log(`  → CLOSE £${fmt(stake)}/pt @ $${plan.stopLoss} (Stop Loss)`)
}

// ── Command ─────────────────────────────────────────────────────────────────

export const planCommand = defineCommand({
  meta: {
    name: "plan",
    description: "Generate a trade plan for a ticker",
  },
  args: {
    ticker: {
      type: "positional",
      description: "Stock ticker symbol (e.g., AAPL, TKA.DE)",
      required: true,
    },
    platform: {
      type: "string",
      description: "Platform (ajbell, aviva, ig, nsandi)",
      alias: "p",
      default: "ig",
    },
    mode: {
      type: "string",
      description: "Trade mode (shares, spreadbet)",
      alias: "m",
      default: "shares",
    },
    account: {
      type: "string",
      description: "Account balance in GBP",
      alias: "a",
      default: "50000",
    },
    risk: {
      type: "string",
      description: "Risk per trade as decimal (e.g., 0.02 for 2%)",
      alias: "r",
      default: "0.02",
    },
    entry: {
      type: "string",
      description: "Manual entry price override",
      alias: "e",
    },
  },
  run({ args }) {
    // 1. Extract
    const ticker = args.ticker
    const platformName = args.platform ?? "ig"
    const mode = (args.mode ?? "shares") as TradeMode
    const accountBalance = parseFloat(args.account ?? "50000")
    const riskPerTrade = parseFloat(args.risk ?? "0.02")
    const entryPrice = args.entry ? parseFloat(args.entry) : undefined

    // 2. Validate platform
    const platform = getPlatform(platformName)
    if (!platform) {
      console.error(
        `❌ Error: Unknown platform "${platformName}". Available: ajbell, aviva, ig, nsandi`,
      )
      process.exit(1)
    }

    // 3. Validate mode
    const validation = validateMode(platformName, mode)
    if (!validation.ok) {
      console.error(`❌ Error: ${validation.error}`)
      process.exit(1)
    }

    // 4. Fetch data
    let history: PriceBar[]
    try {
      history = fetchPriceHistory(ticker)
    } catch (e) {
      console.error(`❌ Error: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }

    // 5. Calculate
    const plan = calculateTradePlan({
      ticker,
      priceHistory: history,
      accountBalance,
      riskPerTrade,
      entryPrice,
    })

    // 6. Render
    if (mode === "spreadbet") {
      renderSpreadBet(plan, accountBalance, riskPerTrade)
    } else {
      renderShares(plan)
    }

    // 7. Warnings
    if (plan.concentrationFlag) {
      console.warn(`⚠️  Warning: Position exceeds 5% of portfolio`)
    }
    if (plan.insufficientHistory) {
      console.warn(
        `⚠️  Warning: Less than 22 days of price history — calculations may be unreliable`,
      )
    }
  },
})
