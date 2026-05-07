#!/usr/bin/env bun
/**
 * Server Lifecycle CLI
 *
 * Manage the TradingAgents dashboard server and related services.
 *
 * Usage:
 *   bun scripts/server-lifecycle.ts status    # show all service status
 *   bun scripts/server-lifecycle.ts start     # start dashboard server
 *   bun scripts/server-lifecycle.ts stop      # stop dashboard server
 *   bun scripts/server-lifecycle.ts restart   # restart dashboard server
 *   bun scripts/server-lifecycle.ts logs      # tail server logs (if available)
 *   bun scripts/server-lifecycle.ts ports     # show listening ports
 */

import { execSync, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { gum } from "./lib/gum.ts"

// ── Types ───────────────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string
  pid: number | null
  port: number | null
  uptime: string | null
  status: "running" | "stopped" | "unknown"
  action: string
}

// ── Service Detection ─────────────────────────────────────────────────────

function getDashboardStatus(): ServiceStatus {
  try {
    const output = execSync("ps aux | grep 'bun run server/index.tsx' | grep -v grep", {
      encoding: "utf-8",
      shell: "/bin/bash",
    })
    const lines = output.trim().split("\n").filter(Boolean)
    if (lines.length === 0) {
      return {
        name: "Dashboard Server",
        pid: null,
        port: 3000,
        uptime: null,
        status: "stopped",
        action: "serve",
      }
    }

    const line = lines[0]
    const parts = line.trim().split(/\s+/)
    const pid = parseInt(parts[1], 10)
    const uptime = parts[9] // CPU time column

    // Check if port is actually listening
    let portStatus: ServiceStatus["status"] = "unknown"
    try {
      execSync("lsof -i :3000 2>/dev/null | grep LISTEN", { encoding: "utf-8" })
      portStatus = "running"
    } catch {
      portStatus = "unknown"
    }

    return {
      name: "Dashboard Server",
      pid,
      port: 3000,
      uptime,
      status: portStatus,
      action: "serve",
    }
  } catch {
    return {
      name: "Dashboard Server",
      pid: null,
      port: 3000,
      uptime: null,
      status: "stopped",
      action: "serve",
    }
  }
}

function getDatabaseStatus(): ServiceStatus {
  const dbPath = process.env.PORTFOLIO_DB ?? "./portfolio.db"
  const testDbPath = process.env.TEST_PORTFOLIO_DB ?? "./test_portfolio.db"

  const liveExists = existsSync(dbPath)
  const testExists = existsSync(testDbPath)

  const mode = process.env.TEST_MODE === "1" ? "TEST" : "LIVE"
  const activeDb = mode === "TEST" ? testDbPath : dbPath

  return {
    name: `SQLite (${mode})`,
    pid: null,
    port: null,
    uptime: null,
    status: existsSync(activeDb) ? "running" : "unknown",
    action: "persist",
  }
}

function getGitnexusStatus(): ServiceStatus {
  try {
    const output = execSync("gitnexus list 2>/dev/null", { encoding: "utf-8" })
    const hasIndex = output.includes("TradingAgents")
    return {
      name: "GitNexus Index",
      pid: null,
      port: null,
      uptime: null,
      status: hasIndex ? "running" : "stopped",
      action: "index",
    }
  } catch {
    return {
      name: "GitNexus Index",
      pid: null,
      port: null,
      uptime: null,
      status: "unknown",
      action: "index",
    }
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  const services = [getDashboardStatus(), getDatabaseStatus(), getGitnexusStatus()]

  const tableLines = [
    "Service            Status     PID     Port  Just",
    "───────────────────────────────────────────────────",
    ...services.map((s) => {
      const pidStr = s.pid?.toString() ?? "—"
      const portStr = s.port?.toString() ?? "—"
      return `${s.name.padEnd(18)} ● ${s.status.padEnd(8)} ${pidStr.padStart(6)} ${portStr.padStart(5)}  ${s.action}`
    }),
    "",
    "just serve / persist / index",
  ].join("\n")

  console.log("")
  console.log(
    await gum("TradingAgents", [
      "--bold",
      "--foreground",
      "212",
      "--width",
      "64",
      "--align",
      "center",
    ]),
  )
  console.log(await gum(tableLines, ["--border", "rounded", "--padding", "1 2", "--width", "64"]))

  const dashboard = services.find((s) => s.name === "Dashboard Server")
  if (dashboard?.status === "running") {
    try {
      execSync("curl -s http://localhost:3000/health >/dev/null", { timeout: 2000 })
      console.log(
        await gum("  ✓ Dashboard responding on http://localhost:3000", ["--foreground", "2"]),
      )
    } catch {
      console.log(
        await gum("  ! Dashboard process running but not responding on port 3000", [
          "--foreground",
          "3",
        ]),
      )
    }
  } else {
    console.log(
      await gum("  ✗ Dashboard not running — start with: just start", ["--foreground", "1"]),
    )
  }
  console.log("")
}

function cmdStart(): void {
  const existing = getDashboardStatus()
  if (existing.status === "running") {
    console.log(`Dashboard already running (PID ${existing.pid})`)
    return
  }

  console.log("Starting dashboard server...")
  const child = spawn("bun", ["run", "server/index.tsx"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  child.unref()

  // Wait a moment then check
  setTimeout(() => {
    const status = getDashboardStatus()
    if (status.status === "running") {
      console.log(`✅ Dashboard started (PID ${status.pid})`)
      console.log(`   http://localhost:3000`)
    } else {
      console.log("⚠️  Server may still be starting. Check with 'status' in 2 seconds.")
    }
  }, 1500)
}

function cmdStop(): void {
  const existing = getDashboardStatus()
  if (existing.status !== "running" || !existing.pid) {
    console.log("Dashboard not running")
    return
  }

  console.log(`Stopping dashboard (PID ${existing.pid})...`)
  try {
    process.kill(existing.pid, "SIGTERM")
    console.log("✅ Sent SIGTERM. Server should stop within 5 seconds.")
  } catch (e) {
    console.error(`❌ Failed to stop: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function cmdRestart(): void {
  const existing = getDashboardStatus()
  if (existing.status === "running" && existing.pid) {
    console.log(`Stopping existing server (PID ${existing.pid})...`)
    try {
      process.kill(existing.pid, "SIGTERM")
    } catch {
      // ignore
    }
    // Wait for process to exit
    let attempts = 0
    const waitForStop = setInterval(() => {
      attempts++
      const current = getDashboardStatus()
      if (current.status !== "running" || attempts > 10) {
        clearInterval(waitForStop)
        if (current.status === "running") {
          console.log("⚠️  Server didn't stop gracefully. Forcing...")
          try {
            process.kill(current.pid!, "SIGKILL")
          } catch {
            // ignore
          }
        }
        setTimeout(() => cmdStart(), 500)
      }
    }, 500)
  } else {
    cmdStart()
  }
}

function cmdPorts(): void {
  console.log("")
  console.log("Listening ports:")
  try {
    const output = execSync("lsof -i -P | grep LISTEN | grep -E 'bun|node|python'", {
      encoding: "utf-8",
      shell: "/bin/bash",
    })
    console.log(output)
  } catch {
    console.log("No listening ports found for bun/node/python")
  }
  console.log("")
}

function cmdLogs(): void {
  console.log("Dashboard logs are written to stdout/stderr of the process.")
  console.log("To see logs, start the server in foreground:")
  console.log("  bun run server/index.tsx")
  console.log("")
  console.log("Or tail system logs:")
  console.log("  log stream --predicate 'process == \"bun\"' --level debug")
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const command = Bun.argv[2] ?? "status"

  switch (command) {
    case "status":
    case "s":
      await cmdStatus()
      break
    case "start":
      cmdStart()
      break
    case "stop":
      cmdStop()
      break
    case "restart":
    case "r":
      cmdRestart()
      break
    case "ports":
      cmdPorts()
      break
    case "logs":
      cmdLogs()
      break
    default:
      console.log("Usage: bun scripts/server-lifecycle.ts <command>")
      console.log("")
      console.log("Commands:")
      console.log("  status    Show all service status")
      console.log("  start     Start dashboard server")
      console.log("  stop      Stop dashboard server")
      console.log("  restart   Restart dashboard server")
      console.log("  ports     Show listening ports")
      console.log("  logs      How to view logs")
      console.log("")
      console.log("Examples:")
      console.log("  bun scripts/server-lifecycle.ts status")
      console.log("  bun scripts/server-lifecycle.ts restart")
      process.exit(1)
  }
}

main()
