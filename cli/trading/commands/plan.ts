#!/usr/bin/env bun
/**
 * Command: trading plan <ticker>
 *
 * Generate a platform-aware trade plan with bracket order details.
 */

import { DatabaseFactory } from "../../../server/lib/db.ts"
import { calculateTradePlan, type PriceBar } from "../../../server/lib/trade-calculator.ts"
import { getPlatform, type TradeMode, validateMode } from "../lib/platforms.ts"

interface PlanArgs {
  ticker: string
  platform: string
  mode: TradeMode
  account: number
  risk: number
  entry?: number
}

function parseArgs(argv: string[]): PlanArgs {
  const ticker = argv[0]
  if (!ticker || ticker.startsWith("--")) {
    throw new Error(
      "Usage: trading plan <TICKER> --platform <name> [--mode shares|spreadbet] [--account N] [--risk N] [--entry N]",
    )
  }

  let platform = "ig"
  let mode: TradeMode = "shares"
  let account = 50000
  let risk = 0.02
  let entry: number | undefined

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--platform" && argv[i + 1]) platform = argv[++i]
    if (argv[i] === "--mode" && argv[i + 1]) mode = argv[++i] as TradeMode
    if (argv[i] === "--account" && argv[i + 1]) account = parseFloat(argv[++i])
    if (argv[i] === "--risk" && argv[i + 1]) risk = parseFloat(argv[++i])
    if (argv[i] === "--entry" && argv[i + 1]) entry = parseFloat(argv[++i])
  }

  return { ticker, platform, mode, account, risk, entry }
}

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

function formatCurrency(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function renderSharesPlan(
  plan: ReturnType<typeof calculateTradePlan>,
  platform: ReturnType<typeof getPlatform>,
): void {
  if (!platform) return

  const notional = plan.positionSize * plan.entry
  const stampDuty = notional * platform.stampDuty
  const commission = platform.commission ?? 0
  const totalCost = notional + stampDuty + commission

  console.log(`┌─────────────────┬────────────────────────────────────┐`)
  console.log(`│ Ticker          │ ${plan.ticker.padEnd(34)} │`)
  console.log(`│ Platform        │ ${(platform.name + " (" + platform.type + ")").padEnd(34)} │`)
  console.log(`│ Mode            │ ${"Shares".padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Entry           │ $${formatCurrency(plan.entry).padEnd(32)} │`)
  console.log(`│ Stop Loss       │ $${formatCurrency(plan.stopLoss).padEnd(32)} │`)
  console.log(`│ Target 1        │ $${formatCurrency(plan.target1).padEnd(32)} │`)
  console.log(`│ Target 2        │ $${formatCurrency(plan.target2).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Position Size   │ ${(String(plan.positionSize) + " shares").padEnd(34)} │`)
  console.log(`│ Notional        │ £${formatCurrency(notional).padEnd(32)} │`)
  if (platform.stampDuty > 0) {
    console.log(`│ Stamp Duty      │ £${formatCurrency(stampDuty).padEnd(32)} │`)
  }
  if (commission > 0) {
    console.log(`│ Commission      │ £${formatCurrency(commission).padEnd(32)} │`)
  }
  console.log(`│ Total Cost      │ £${formatCurrency(totalCost).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Risk Amount     │ £${formatCurrency(plan.riskAmount).padEnd(32)} │`)
  console.log(
    `│ Risk %          │ ${(String((plan.riskPercent * 100).toFixed(2)) + "% of account").padEnd(34)} │`,
  )
  console.log(`│ R/R Ratio       │ ${(String(calculateRR(plan)) + ":1").padEnd(34)} │`)
  console.log(`│ ATR (14d)       │ ${String(plan.atr14.toFixed(4)).padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ ${"Tax Note".padEnd(15)} │ ${platform.taxNote.padEnd(34)} │`)
  console.log(`│ ${"Access".padEnd(15)} │ ${platform.accessNote.padEnd(34)} │`)
  if (plan.concentrationFlag) {
    console.log(`│ ⚠️  Warning     │ Position exceeds 5% of portfolio   │`)
  }
  if (plan.insufficientHistory) {
    console.log(`│ ⚠️  Warning     │ Insufficient price history         │`)
  }
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

function renderSpreadBetPlan(
  plan: ReturnType<typeof calculateTradePlan>,
  platform: ReturnType<typeof getPlatform>,
): void {
  if (!platform || !platform.marginFactor || !platform.overnightRate) return

  const riskAmount = plan.accountBalance * plan.riskPerTrade
  const stopDistance = plan.entry - plan.stopLoss
  const stake = stopDistance > 0 ? riskAmount / stopDistance : 0
  const notional = stake * plan.entry
  const margin = notional * platform.marginFactor
  const overnight = (notional * platform.overnightRate) / 365

  console.log(`┌─────────────────┬────────────────────────────────────┐`)
  console.log(`│ Ticker          │ ${plan.ticker.padEnd(34)} │`)
  console.log(`│ Platform        │ ${(platform.name + " (Spread Bet)").padEnd(34)} │`)
  console.log(`│ Mode            │ ${"Spread Bet".padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Entry           │ $${formatCurrency(plan.entry).padEnd(32)} │`)
  console.log(`│ Stop Loss       │ $${formatCurrency(plan.stopLoss).padEnd(32)} │`)
  console.log(`│ Stop Distance   │ ${(String(stopDistance.toFixed(2)) + " points").padEnd(34)} │`)
  console.log(`│ Target 1        │ $${formatCurrency(plan.target1).padEnd(32)} │`)
  console.log(`│ Target 2        │ $${formatCurrency(plan.target2).padEnd(32)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Stake           │ £${formatCurrency(stake).padEnd(32)} / point │`)
  console.log(`│ Notional        │ £${formatCurrency(notional).padEnd(32)} │`)
  console.log(`│ Margin Required │ £${formatCurrency(margin).padEnd(32)} │`)
  console.log(`│ Overnight Fin.  │ ~£${formatCurrency(overnight).padEnd(31)} / day │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ Risk Amount     │ £${formatCurrency(riskAmount).padEnd(32)} │`)
  console.log(
    `│ Risk %          │ ${(String((plan.riskPerTrade * 100).toFixed(2)) + "% of account").padEnd(34)} │`,
  )
  console.log(`│ R/R Ratio       │ ${(String(calculateRR(plan)) + ":1").padEnd(34)} │`)
  console.log(`│ ATR (14d)       │ ${String(plan.atr14.toFixed(4)).padEnd(34)} │`)
  console.log(`├─────────────────┼────────────────────────────────────┤`)
  console.log(`│ ${"Tax Note".padEnd(15)} │ ${platform.taxNote.padEnd(34)} │`)
  console.log(`│ ${"Overnight".padEnd(15)} │ Financing applied at market close  │`)
  if (plan.insufficientHistory) {
    console.log(`│ ⚠️  Warning     │ Insufficient price history         │`)
  }
  console.log(`└─────────────────┴────────────────────────────────────┘`)

  console.log(``)
  console.log(`Bracket Order:`)
  console.log(`  OPEN £${formatCurrency(stake)}/pt @ $${plan.entry} (Buy)`)
  console.log(
    `  → CLOSE £${formatCurrency(stake)}/pt @ $${plan.target1} (Take Profit)  [50% at T1]`,
  )
  console.log(
    `  → CLOSE £${formatCurrency(stake)}/pt @ $${plan.target2} (Take Profit)  [remainder at T2]`,
  )
  console.log(`  → CLOSE £${formatCurrency(stake)}/pt @ $${plan.stopLoss} (Stop Loss)`)
}

function calculateRR(plan: ReturnType<typeof calculateTradePlan>): string {
  const risk = plan.entry - plan.stopLoss
  const reward = plan.target2 - plan.entry
  return risk > 0 ? (reward / risk).toFixed(2) : "—"
}

export function planCommand(argv: string[]): void {
  const args = parseArgs(argv)
  const platform = getPlatform(args.platform)

  if (!platform) {
    throw new Error(`Unknown platform: ${args.platform}. Known: ajbell, aviva, ig, nsandi`)
  }

  const validation = validateMode(args.platform, args.mode)
  if (!validation.ok) {
    throw new Error(validation.error!)
  }

  const history = fetchPriceHistory(args.ticker)
  const plan = calculateTradePlan({
    ticker: args.ticker,
    priceHistory: history,
    accountBalance: args.account,
    riskPerTrade: args.risk,
    entryPrice: args.entry,
  })

  // Inject account/risk into plan for spread bet calc
  const enrichedPlan = { ...plan, accountBalance: args.account, riskPerTrade: args.risk }

  if (args.mode === "spreadbet") {
    renderSpreadBetPlan(enrichedPlan, platform)
  } else {
    renderSharesPlan(enrichedPlan, platform)
  }
}
