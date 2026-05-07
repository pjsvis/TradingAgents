/**
 * Shared CLI argument definitions for citty commands.
 * Import and reuse across subcommands for consistency.
 */

export const tickerArg = {
  type: "positional" as const,
  description: "Stock ticker symbol (e.g., AAPL, TKA.DE)",
  required: true,
}

export const platformArg = {
  type: "string" as const,
  description: "Platform (ajbell, aviva, ig, nsandi)",
  alias: "p",
  default: "ig",
}

export const modeArg = {
  type: "string" as const,
  description: "Trade mode (shares, spreadbet)",
  alias: "m",
  default: "shares",
}

export const accountArg = {
  type: "string" as const,
  description: "Account balance in GBP",
  alias: "a",
  default: "50000",
}

export const riskArg = {
  type: "string" as const,
  description: "Risk per trade as decimal (e.g., 0.02 for 2%)",
  alias: "r",
  default: "0.02",
}

export const entryArg = {
  type: "string" as const,
  description: "Manual entry price override",
  alias: "e",
}
