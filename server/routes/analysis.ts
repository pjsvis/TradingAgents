import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { DatabaseFactory } from "../lib/db.ts"
import { sanitizeForDb } from "../lib/sanitize.ts"

export const analysisRouter = new Hono()

/**
 * Resolve the TradingAgents project root.
 * Order: TA_ROOT env → sibling directory → parent directory
 */
function findProjectRoot(): string {
  if (process.env.TA_ROOT) return process.env.TA_ROOT

  const projectRoot = dirname(dirname(import.meta.dir))
  const sibling = join(projectRoot, "..", "TradingAgents")
  if (existsSync(join(sibling, "scripts", "analyze_stream.py"))) {
    return sibling
  }

  if (existsSync(join(projectRoot, "scripts", "analyze_stream.py"))) {
    return projectRoot
  }

  throw new Error("Cannot find TradingAgents root. Set TA_ROOT env var.")
}

/**
 * POST /api/analyze — trigger analysis, stream progress via SSE
 *
 * Body: { ticker, date?, analysts?, llm_provider?, debates? }
 *
 * SSE events: start, agent_report, debate_round, risk_assessment,
 *             decision, complete, error
 *
 * After completion, the full analysis state (all agent reports, debate rounds,
 * risk assessment, final decision) is saved to the analyses table as JSON
 * in the raw_state column.
 */
analysisRouter.post("/", async (c) => {
  const body = await c.req.json()
  const { ticker, analysts, debates, date } = body

  if (!ticker) return c.json({ error: "ticker is required" }, 400)

  const analystsStr = typeof analysts === "string" ? analysts : "market,news,fundamentals"
  const debatesNum = Math.min(Math.max(1, Number(debates) || 1), 5)
  const dateStr = typeof date === "string" && date ? date : new Date().toISOString().slice(0, 10)
  const config = JSON.stringify({ analysts: analystsStr, debates: debatesNum, date: dateStr })

  // ── Pre-create analyses record ──────────────────────────────────────
  let analysisId: number | null = null
  try {
    const db = DatabaseFactory.get()
    const result = db
      .prepare(
        "INSERT INTO analyses (ticker, date, config, decision, platform) VALUES (?, ?, ?, ?, ?)",
      )
      .run(ticker, dateStr, config, null, "unknown")
    analysisId = result.lastInsertRowid as number
  } catch (err) {
    console.error("Failed to create analyses record:", err)
    // Proceed without analysis ID — stream still works, just no DB state
  }

  // ── Event collector ─────────────────────────────────────────────────
  // Collect all events so we can save the full state after stream ends
  const events: Array<{ event: string; data: unknown }> = []

  const root = findProjectRoot()
  const venvPython = join(root, ".venv", "bin", "python3")
  const script = join(root, "scripts", "analyze_stream.py")

  if (!existsSync(script)) {
    return c.json({ error: `analyze_stream.py not found at ${script}` }, 500)
  }

  // Position context from DB
  let positionContext: string | null = null
  try {
    const db = DatabaseFactory.get()
    const row = db
      .query("SELECT * FROM positions WHERE ticker = ? AND status = 'open' LIMIT 1")
      .get(ticker) as Record<string, unknown> | undefined
    if (row) {
      const qty = row.quantity as number
      const cost = row.avg_cost as number
      const thesis = (row.thesis as string) || null
      positionContext = `${qty} shares @ ${cost}`
      if (thesis) positionContext += ` — thesis: ${thesis}`
    }
  } catch {
    // DB not ready
  }

  return streamSSE(c, async (stream) => {
    const args = [
      script,
      ticker,
      "--date",
      dateStr,
      "--analysts",
      analystsStr,
      "--debates",
      String(debatesNum),
    ]
    if (positionContext) args.push("--position-context", positionContext)

    const child = spawn(venvPython, args, {
      cwd: root,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    })

    let stderr = ""
    const MAX_STDERR = 8192

    const rl = createInterface({ input: child.stdout })

    rl.on("line", (line) => {
      try {
        const parsed = JSON.parse(line)
        if (parsed.event && parsed.data !== undefined) {
          // Collect for post-stream persistence
          events.push({ event: parsed.event, data: parsed.data })

          // Auto-save decision as a signal in the DB
          if (parsed.event === "decision") {
            const d = parsed.data as Record<string, unknown>
            try {
              const db = DatabaseFactory.get()
              db.prepare(
                "INSERT INTO signals (ticker, date, signal, reasoning, confidence) VALUES (?, ?, ?, ?, ?)",
              ).run(
                ticker,
                dateStr,
                (d.signal as string) ?? "hold",
                sanitizeForDb(d.reasoning as string) ?? null,
                (d.confidence as string) ?? null,
              )
            } catch {
              /* DB write failure shouldn't break the stream */
            }
          }

          stream
            .writeSSE({ event: parsed.event, data: JSON.stringify(parsed.data) })
            .catch(() => {})
        }
      } catch {
        // Skip non-JSON output (warnings, etc.)
      }
    })

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (stderr.length > MAX_STDERR) stderr = stderr.slice(-MAX_STDERR)
    })

    const abortController = new AbortController()

    let sigkillTimeout: ReturnType<typeof setTimeout> | undefined
    const abortHandler = () => {
      child.kill("SIGTERM")
      sigkillTimeout = setTimeout(() => child.kill("SIGKILL"), 5000)
      abortController.abort()
    }

    if (stream.onAbort) stream.onAbort(abortHandler)
    c.req.raw.signal.addEventListener("abort", abortHandler, { once: true })

    function cleanup() {
      rl.close()
      c.req.raw.signal.removeEventListener("abort", abortHandler)
      if (sigkillTimeout) clearTimeout(sigkillTimeout)
    }

    // ── Persist full analysis state to DB ──────────────────────────────
    function persistState() {
      if (analysisId === null) return

      try {
        const db = DatabaseFactory.get()
        // Extract final decision text from events
        const decisionEvent = events.find((e) => e.event === "decision")
        const decisionText = decisionEvent
          ? `${(decisionEvent.data as Record<string, unknown>).signal ?? "hold"} — ${sanitizeForDb((decisionEvent.data as Record<string, unknown>).reasoning as string) ?? ""}`
          : null

        db.prepare("UPDATE analyses SET raw_state = ?, decision = ? WHERE id = ?").run(
          JSON.stringify(events),
          decisionText,
          analysisId,
        )
      } catch (err) {
        console.error("Failed to persist analysis state:", err)
      }
    }

    await new Promise<void>((resolve) => {
      child.on("close", (code) => {
        cleanup()

        persistState()

        if (code !== 0 && code !== null) {
          stream
            .writeSSE({
              event: "error",
              data: JSON.stringify({
                message: `Python process exited with code ${code}`,
                stderr: stderr.slice(-2000),
              }),
            })
            .catch(() => {})
        }

        resolve()
      })

      child.on("error", (err) => {
        cleanup()
        persistState()
        stream
          .writeSSE({ event: "error", data: JSON.stringify({ message: err.message }) })
          .catch(() => {})
        resolve()
      })

      abortController.signal.addEventListener("abort", () => {
        cleanup()
        resolve()
      }, { once: true })
    })
  })
})
