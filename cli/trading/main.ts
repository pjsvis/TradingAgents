#!/usr/bin/env bun
/**
 * Unified Trading CLI
 *
 * Usage: trading <command> [args]
 *
 * Commands:
 *   plan <ticker>     — generate trade plan
 *   portfolio          — show holdings + P&L
 *   sync               — catch up prices
 *   analyze <ticker>   — run tradingagents analysis
 *   seed               — seed database
 *   prices <ticker>    — current price
 *   config             — show/set defaults
 *   help               — this message
 *
 * Examples:
 *   trading plan AAPL --platform ig --account 50000 --risk 0.02
 *   trading plan TKA.DE --platform ajbell --account 25000
 */

import { planCommand } from "./commands/plan.ts"

const COMMANDS: Record<string, (args: string[]) => void | Promise<void>> = {
  plan: planCommand,
  help: showHelp,
}

function showHelp(): void {
  console.log(`Unified Trading CLI

Usage: trading <command> [args]

Commands:
  plan <ticker>      Generate trade plan (shares or spread bet)
  portfolio          Show holdings and P&L
  sync               Catch up prices for open positions
  analyze <ticker>   Run multi-agent analysis
  seed               Seed database
  prices <ticker>    Current price for ticker
  config             Show/set defaults
  help               This message

Examples:
  trading plan AAPL --platform ig --account 50000 --risk 0.02
  trading plan AAPL --platform ig --mode spreadbet --account 50000 --risk 0.02
  trading analyze IONQ --debates 2
  trading sync --ticker AAPL
`)
}

async function main() {
  const args = Bun.argv.slice(2)
  const command = args[0]

  if (!command || command === "help" || command === "--help" || command === "-h") {
    showHelp()
    process.exit(0)
  }

  const handler = COMMANDS[command]
  if (!handler) {
    console.error(`Unknown command: ${command}`)
    console.error(`Run "trading help" for usage.`)
    process.exit(1)
  }

  try {
    await handler(args.slice(1))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

main()
