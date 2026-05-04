/**
 * POST /api/portfolio/balance — update manual account balance
 *
 * Body: { account_id, balance, note? }
 */
import { Hono } from "hono"
import { DatabaseFactory } from "../lib/db.ts"

export const portfolioBalanceRouter = new Hono()

portfolioBalanceRouter.post("/", async (c) => {
  try {
    const body = await c.req.json()
    const { account_id, balance, note } = body

    if (!account_id) return c.json({ error: "account_id is required" }, 400)
    if (typeof balance !== "number" || isNaN(balance)) {
      return c.json({ error: "balance must be a number" }, 400)
    }

    const db = DatabaseFactory.get()
    const date = new Date().toISOString().split("T")[0]

    // Upsert account balance
    db.run(
      "INSERT INTO accounts (id, balance, updated_at) VALUES (?, ?, datetime('now'))",
      [account_id, balance],
    )

    // Record balance history
    db.run(
      "INSERT INTO account_balances (account_id, balance, date, note) VALUES (?, ?, ?, ?)",
      [account_id, balance, date, note ?? null],
    )

    return c.json({ ok: true, account_id, balance, date })
  } catch (e: unknown) {
    const msg = (e as Error).message
    if (msg.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Account not found", detail: msg }, 404)
    }
    return c.json({ error: "Failed to update balance", detail: msg }, 500)
  }
})