# ── hLedger: plain-text accounting ─────────────────────────────────────────
#   Holdings, cash, allocation, prices, backups.
#   Use: just hledger::<recipe>  or aliases: just hl, just hl-cash, etc.

# Holdings summary with market values
[group("hledger")]
hl:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" balance --tree --value end

# Holdings only (excludes cash)
[group("hledger")]
hl-holdings:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" balance assets: --tree

# Cash balances per platform
[group("hledger")]
hl-cash:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" balance assets: --tree | grep -E "(cash|EUR|USD)"

# All accounts defined in journal
[group("hledger")]
hl-accounts:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" accounts

# Backup hledger journal
[group("hledger")]
hl-backup:
    ~/.tradingagents/bin/backup-hledger.sh

# Verify latest backup integrity
[group("hledger")]
hl-backup-verify:
    ~/.tradingagents/bin/backup-hledger.sh --verify

# Restore hledger from a backup
[group("hledger")]
hl-backup-restore FILE:
    ~/.tradingagents/bin/backup-hledger.sh --restore {{FILE}}

# Price history
[group("hledger")]
hl-prices:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" prices

# Fetch latest prices from Yahoo Finance
[group("hledger")]
hl-update-prices:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" prices --auto

# Allocation tree by account
[group("hledger")]
hl-allocation:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" balance --tree --value end --depth 3

# Transaction history for a ticker
[group("hledger")]
hl-register TICKER:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" reg {{TICKER}}

# Net worth over time
[group("hledger")]
hl-net-worth:
    hledger -f "${HLEDGER_FILE:-~/.hledger.journal}" balance --tree --equity --monthly
