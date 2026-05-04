/** @jsxImportSource hono/jsx */

export function IntelligenceView() {
  return (
    <>
      {/* Allocation bar — main portfolio composition */}
      <section class="panel" id="allocation-bar-panel">
        <h3>Portfolio Allocation</h3>
        <div id="allocation-bar-body">
          <div class="muted">Loading…</div>
        </div>
      </section>

      {/* Portfolio hero — key totals */}
      <section class="panel" id="portfolio-hero">
        <div id="intel-loading" style="color:var(--text-dim)">Loading portfolio intelligence…</div>
        <div id="intel-body" style="display:none" />
      </section>

      {/* Cash breakdown */}
      <section class="panel" id="cash-breakdown-panel">
        <h3>Cash Breakdown</h3>
        <div id="cash-breakdown-body">
          <div class="muted">Loading…</div>
        </div>
      </section>

      {/* Accounts summary table */}
      <section class="panel" id="accounts-panel">
        <h3>Accounts</h3>
        <div id="accounts-body">
          <div class="muted">Loading…</div>
        </div>
      </section>

      {/* Asset allocation (existing view) */}
      <section class="panel" id="asset-class-panel">
        <h3>Asset Class</h3>
        <div id="asset-class-body">
          <div class="muted">Loading…</div>
        </div>
      </section>

      {/* Spread bet positions */}
      <section class="panel" id="spreadbets-panel" style="display:none">
        <h3>Spread Bet Book</h3>
        <div id="spreadbets-body" />
      </section>

      {/* Research queue */}
      <section class="panel" id="research-queue-panel" style="display:none">
        <h3>Research Queue <span class="muted" style="font-size:0.8em">— approved stage</span></h3>
        <div id="research-queue-body" />
      </section>

      {/* Governance alerts */}
      <section class="panel" id="governance-panel">
        <h3>Governance Alerts</h3>
        <div id="governance-body">
          <div class="muted">Loading…</div>
        </div>
      </section>

      {/* Manual balance update */}
      <section class="panel" id="balance-update-panel">
        <h3>Update Account Balance</h3>
        <form
          hx-post="/api/portfolio/balance"
          hx-swap="none"
          {...{ "hx-on::after-request": "if(event.detail.successful) { this.reset(); loadIntel(); }" }}
        >
          <div class="form-row">
            <select name="account_id" required>
              <option value="">— Select account —</option>
            </select>
            <input name="balance" type="number" step="0.01" placeholder="New balance (£)" required />
            <input name="note" placeholder="Note (e.g. 'monthly update')" style="flex:1" />
            <button type="submit">Update</button>
          </div>
        </form>
      </section>

      <script dangerouslySetInnerHTML={{ __html: intelligenceScript() }} />
    </>
  )
}

function intelligenceScript(): string {
  return `
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
}
function _cls(n) {
  if (n == null) return '';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return '';
}
function _fmt(n, dec) {
  if (n == null) return '—';
  return n.toFixed(dec != null ? dec : 2);
}
function _fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}
function _bar(buckets) {
  if (!buckets || buckets.length === 0) return '';
  var total = 100; // always 100% by construction
  var html = '<div class="allocation-bar" style="height:24px;border-radius:4px;overflow:hidden;display:flex;margin-bottom:6px">';
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    var w = b.actual_pct != null ? Math.round(b.actual_pct) : 0;
    if (w <= 0) continue;
    var title = b.label + ': ' + w + '% (\\u00a3' + (b.value_gbp || 0).toFixed(0) + ') vs target ' + b.target_pct + '%';
    html += '<div style="width:' + w + '%;background:' + b.color + ';min-width:2px" title="' + title + '"></div>';
  }
  html += '</div>';
  // Legend row
  for (var j = 0; j < buckets.length; j++) {
    var b = buckets[j];
    var actual = b.actual_pct != null ? b.actual_pct.toFixed(1) : '0.0';
    var target = b.target_pct;
    var diff = (b.actual_pct != null ? b.actual_pct - target : -target).toFixed(1);
    var diffStr = diff >= 0 ? '+' + diff : diff;
    var diffColor = diff >= 0 ? 'var(--green)' : 'var(--red)';
    html += '<div style="display:inline-block;margin-right:16px;font-size:0.8em">';
    html += '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + b.color + ';vertical-align:middle;margin-right:4px"></span>';
    html += '<strong>' + b.label + '</strong> ';
    html += '<span style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + actual + '%</span>';
    html += ' / target ' + target + '% ';
    html += '<span style="color:' + diffColor + '">(' + diffStr + 'pp)</span>';
    html += ' (\\u00a3' + (b.value_gbp || 0).toFixed(0) + ')';
    html += '</div>';
  }
  return html;
}

function loadIntel() {
  fetch('/api/portfolio/intelligence')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderAllocationBar(data);
      renderIntel(data);
      renderCashBreakdown(data);
      renderAccounts(data);
      renderAssetClasses(data);
      renderSpreadBets(data);
      renderResearchQueue(data);
      renderGovernance(data);
      populateAccountSelect(data);
    })
    .catch(function(err) {
      var body = document.getElementById('intel-body');
      if (body) body.innerHTML = '<div class="error-card"><strong>Intelligence error</strong><br>' + err.message + '</div>';
      var loading = document.getElementById('intel-loading');
      if (loading) loading.style.display = 'none';
    });
}

function renderAllocationBar(data) {
  var el = document.getElementById('allocation-bar-body');
  if (!data || !data.allocation_bar) {
    el.innerHTML = '<div class="muted">No allocation data</div>';
    return;
  }
  var ab = data.allocation_bar;
  var html = _bar(ab.buckets);
  // Alerts if buckets drift
  var alerts = '';
  for (var i = 0; i < ab.buckets.length; i++) {
    var b = ab.buckets[i];
    var drift = b.actual_pct != null ? Math.abs(b.actual_pct - b.target_pct) : b.target_pct;
    if (drift > 10) {
      alerts += '<div class="banner" style="margin-top:8px">\\u26a0\\ufe0f ' + b.label + ' is ' + (b.actual_pct != null ? b.actual_pct.toFixed(1) : '0') + '% (target: ' + b.target_pct + '%) — ' + (drift > 20 ? 'significant drift' : 'mild drift') + '</div>';
    }
  }
  el.innerHTML = html + alerts;
}

function renderIntel(data) {
  var loading = document.getElementById('intel-loading');
  var body = document.getElementById('intel-body');
  if (loading) loading.style.display = 'none';
  if (body) body.style.display = '';

  var pf = data.portfolio || {};
  var fx = data.fx_rates || {};
  var total = pf.total_value_gbp || 0;

  var html = '';

  // Data quality warning for negative cash
  if (pf.cash_negative) {
    html += '<div class="banner" style="margin-bottom:1rem">';
    html += '\\u26a0\\ufe0f Cash is negative \\u2014 more sells than buys in hledger. Review journal entries.';
    html += '</div>';
  }

  // Hero row
  html += '<div class="intel-hero">';
  html += '<div class="intel-stat"><div class="intel-label">Total Portfolio</div><div class="intel-value">\\u00a3' + _fmt(total) + '</div></div>';
  html += '<div class="intel-stat"><div class="intel-label">Cash</div><div class="intel-value' + (pf.cash_negative ? ' negative' : '') + '">\\u00a3' + _fmt(pf.cash_gbp) + '</div></div>';
  html += '<div class="intel-stat"><div class="intel-label">Deployed</div><div class="intel-value">\\u00a3' + _fmt(pf.deployed_gbp) + '</div></div>';
  html += '<div class="intel-stat"><div class="intel-label">Spread Bet</div><div class="intel-value">\\u00a3' + _fmt(pf.spreadbet_gbp) + '</div></div>';
  html += '</div>';

  // FX rates
  html += '<div class="intel-fx">';
  if (fx.GBPEUR) html += '<span>GBPEUR: ' + fx.GBPEUR.toFixed(4) + '</span>';
  if (fx.GBPUSD) html += '<span>GBPUSD: ' + fx.GBPUSD.toFixed(4) + '</span>';
  html += '</div>';

  body.innerHTML = html;
}

function renderCashBreakdown(data) {
  var el = document.getElementById('cash-breakdown-body');
  if (!data || !data.cash_breakdown) {
    el.innerHTML = '<div class="muted">No cash data</div>';
    return;
  }
  var cb = data.cash_breakdown;
  var html = '<table class="data-table"><tbody>';
  html += '<tr><td>Total cash</td><td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">\\u00a3' + _fmt(cb.total_cash_gbp) + '</td></tr>';
  html += '<tr><td class="muted" style="padding-left:1em">Reserve (' + cb.reserve_pct + '% floor)</td><td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1;color:var(--text-dim)">\\u00a3' + _fmt(cb.reserve_gbp) + '</td></tr>';
  html += '<tr><td class="muted" style="padding-left:1em">Spread bet allocation (' + cb.spreadbet_allocation_pct + '% target)</td><td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1;color:var(--text-dim)">\\u00a3' + _fmt(cb.spreadbet_allocation_gbp) + '</td></tr>';
  html += '<tr><td>\\u2192 Investable cash</td><td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1;color:var(--green)">\\u00a3' + _fmt(cb.investable_gbp) + ' <span class="muted">(' + _fmtPct(cb.investable_pct) + ')</span></td></tr>';
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderAccounts(data) {
  var el = document.getElementById('accounts-body');
  if (!data || !data.accounts || data.accounts.length === 0) {
    el.innerHTML = '<div class="muted">No accounts configured</div>';
    return;
  }
  var html = '<table class="data-table"><thead><tr>';
  html += '<th>Account</th><th>Type</th><th>Balance</th><th>Deployed</th><th>Spread Bet</th><th>Total</th><th>Positions</th>';
  html += '</tr></thead><tbody>';
  for (var i = 0; i < data.accounts.length; i++) {
    var a = data.accounts[i];
    var typeLabel = { isa: 'ISA', shares: 'Shares', sipp: 'SIPP', spreadbet: 'Spread Bet', savings: 'Savings', cash: 'Cash' }[a.account_type] || a.account_type;
    var total = a.total_value_gbp || 0;
    var balance = a.balance_gbp || 0;
    html += '<tr>';
    html += '<td><strong>' + _esc(a.name || a.id) + '</strong><br><span class="muted" style="font-size:0.75em">' + _esc(a.provider) + '</span></td>';
    html += '<td><span class="platform-tag">' + typeLabel + '</span></td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">\\u00a3' + _fmt(balance) + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">\\u00a3' + _fmt(a.deployed_gbp) + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">\\u00a3' + _fmt(a.spreadbet_gbp) + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1"><strong>\\u00a3' + _fmt(total) + '</strong></td>';
    html += '<td>' + a.positions_count + (a.bets_count > 0 ? ' <span class="muted">+' + a.bets_count + 'bets</span>' : '') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderAssetClasses(data) {
  var el = document.getElementById('asset-class-body');
  if (!data || !data.asset_classes || data.asset_classes.length === 0) {
    el.innerHTML = '<div class="muted">No allocation data</div>';
    return;
  }
  var total = (data.portfolio && data.portfolio.total_value_gbp) || 1;
  var bars = data.asset_classes.map(function(v) {
    var w = Math.round((v.value_gbp / total) * 100);
    var color = v.assetClass === 'cash' ? '#3b82f6' :
                v.assetClass === 'equity' ? '#22c55e' :
                v.assetClass === 'etf' ? '#eab308' :
                v.assetClass === 'crypto' ? '#ef4444' : '#71717a';
    return '<div style="display:inline-block;height:12px;width:' + w + '%;background:' + color + ';margin-right:2px" title="' + v.assetClass + ': ' + w + '% (\\u00a3' + v.value_gbp.toFixed(0) + ')"></div>';
  }).join('');
  var labels = data.asset_classes.map(function(v) {
    var w = Math.round((v.value_gbp / total) * 100);
    return '<span style="margin-right:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' +
      (v.assetClass === 'cash' ? '#3b82f6' : v.assetClass === 'equity' ? '#22c55e' : v.assetClass === 'etf' ? '#eab308' : v.assetClass === 'crypto' ? '#ef4444' : '#71717a') +
      ';vertical-align:middle;margin-right:4px"></span>' + v.assetClass + ' ' + w + '% (\\u00a3' + v.value_gbp.toFixed(0) + ')</span>';
  }).join('');
  el.innerHTML = '<div style="margin-bottom:4px">' + bars + '</div><div style="font-size:0.8em;color:var(--text-dim)">' + labels + '</div>';
}

function renderSpreadBets(data) {
  var el = document.getElementById('spreadbets-panel');
  var body = document.getElementById('spreadbets-body');
  if (!data || !data.spreadbets || data.spreadbets.length === 0) {
    if (el) el.style.display = 'none';
    return;
  }
  if (el) el.style.display = '';
  var html = '<table class="data-table"><thead><tr>';
  html += '<th>Ticker</th><th>Direction</th><th>Entry</th><th>Current</th><th>Stake</th><th>P&L</th><th>Stop</th><th>Target</th>';
  html += '</tr></thead><tbody>';
  for (var i = 0; i < data.spreadbets.length; i++) {
    var b = data.spreadbets[i];
    var pnlCls = _cls(b.pnl_gbp);
    var pnlStr = b.pnl_gbp != null ? (b.pnl_gbp >= 0 ? '+' : '') + '\\u00a3' + _fmt(b.pnl_gbp) : '—';
    var dirColor = b.direction === 'long' ? 'var(--green)' : 'var(--red)';
    html += '<tr>';
    html += '<td class="ticker">' + _esc(b.ticker) + '</td>';
    html += '<td style="color:' + dirColor + ';font-weight:bold">' + b.direction.toUpperCase() + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">\\u00a3' + _fmt(b.entry_price) + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + (b.current_price_gbp != null ? '\\u00a3' + _fmt(b.current_price_gbp) : '—') + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + b.stake_per_point + '/pt</td>';
    html += '<td class="pnl-cell ' + pnlCls + '" style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + pnlStr + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + (b.stop_price != null ? '\\u00a3' + _fmt(b.stop_price) : '—') + '</td>';
    html += '<td style="font-family:Datatype,monospace;font-feature-settings:\\'calt\\'1,\\'liga\\'1">' + (b.target_price != null ? '\\u00a3' + _fmt(b.target_price) : '—') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  body.innerHTML = html;
}

function renderResearchQueue(data) {
  var el = document.getElementById('research-queue-panel');
  var body = document.getElementById('research-queue-body');
  if (!data || !data.research_queue || data.research_queue.length === 0) {
    if (el) el.style.display = 'none';
    return;
  }
  if (el) el.style.display = '';
  var html = '<table class="data-table"><thead><tr>';
  html += '<th>Ticker</th><th>Exchange</th><th>Priority</th><th>Thesis</th><th>Last Signal</th>';
  html += '</tr></thead><tbody>';
  for (var i = 0; i < data.research_queue.length; i++) {
    var r = data.research_queue[i];
    var prioColor = r.priority === 'high' ? 'var(--red)' : r.priority === 'medium' ? 'var(--yellow)' : 'var(--text-dim)';
    html += '<tr>';
    html += '<td class="ticker">' + _esc(r.ticker) + '</td>';
    html += '<td class="muted">' + _esc(r.exchange) + '</td>';
    html += '<td style="color:' + prioColor + ';font-weight:bold;text-transform:uppercase;font-size:0.8em">' + r.priority + '</td>';
    html += '<td>' + (_esc(r.thesis) || '—') + '</td>';
    html += '<td>' + (_esc(r.last_signal) || '—') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  body.innerHTML = html;
}

function renderGovernance(data) {
  var el = document.getElementById('governance-body');
  if (!data || !data.governance) {
    el.innerHTML = '<div class="muted">No governance data</div>';
    return;
  }

  var gov = data.governance;
  var html = '';

  if (gov.violations && gov.violations.length > 0) {
    html += '<h4>\\u26a0\\ufe0f Violations</h4>';
    for (var vi = 0; vi < gov.violations.length; vi++) {
      var v = gov.violations[vi];
      var cls = v.severity === 'breach' ? 'violation-breach' : 'violation-warn';
      html += '<div class="' + cls + '"><strong>' + v.rule.name + '</strong>: ' + v.detail + '</div>';
    }
  } else {
    html += '<div class="ok">\\u2705 All rules satisfied</div>';
  }

  if (gov.suggestions && gov.suggestions.length > 0) {
    html += '<h4 style="margin-top:1rem">Rebalance Suggestions</h4>';
    html += '<table class="data-table" style="font-size:0.85em"><thead><tr>';
    html += '<th>Ticker</th><th>Action</th><th>Current</th><th>Target</th><th>Drift</th>';
    html += '</tr></thead><tbody>';
    for (var si = 0; si < gov.suggestions.length; si++) {
      var s = gov.suggestions[si];
      html += '<tr>';
      html += '<td class="ticker">' + s.ticker + '</td>';
      html += '<td class="' + (s.action === 'trim' ? 'negative' : 'positive') + '">' + s.action.toUpperCase() + '</td>';
      html += '<td>' + _fmtPct(s.currentWeight) + '</td>';
      html += '<td>' + _fmtPct(s.targetWeight) + '</td>';
      html += '<td>' + _fmt(s.delta) + 'pp</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  el.innerHTML = html;
}

function populateAccountSelect(data) {
  var select = document.querySelector('select[name="account_id"]');
  if (!select) return;
  var options = '<option value="">— Select account —</option>';
  if (data && data.accounts) {
    for (var i = 0; i < data.accounts.length; i++) {
      var a = data.accounts[i];
      options += '<option value="' + a.id + '">' + (a.name || a.id) + '</option>';
    }
  }
  select.innerHTML = options;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadIntel);
} else {
  loadIntel();
}
`;
}