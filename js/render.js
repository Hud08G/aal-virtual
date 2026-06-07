// aa-virtual/public/js/render.js
// All DOM rendering — reads from STATE, writes nothing

function renderAll() {
  renderMetrics();
  renderFleet();
  renderRoutes();
  renderFinances();
  renderStaff();
  renderLog();
}

// ── Metrics bar ───────────────────────────────────────
function renderMetrics() {
  const fin = STATE.finances;
  const active = STATE.fleet.filter(a => a.status === 'Active').length;
  setEl('m-cash', fin ? fmt$(fin.cash) : '—');
  setEl('m-debt', fin ? fmt$(fin.debt) : '—');
  setEl('m-fleet', active);
  setEl('m-routes', STATE.routes.length);
  setEl('m-flights', STATE.totalFlights);
  setEl('m-pilots', STATE.pilots.length);
}

// ── Fleet ─────────────────────────────────────────────
function renderFleet() {
  const el = document.getElementById('fleet-list');
  if (!el) return;
  el.innerHTML = STATE.fleet.map(a => {
    if (a.locked) return `
      <div class="card fleet-card locked">
        <div>
          <div class="card-title">${a.name}</div>
          <div class="card-sub">${a.type} · ${a.seats} seats · ${a.unlock_requirement || 'locked'}</div>
        </div>
        <span class="badge badge-muted"><i class="ti ti-lock"></i> Locked</span>
      </div>`;
    const maxHours = { 'GA': 100, 'Regional': 200, 'Narrowbody': 300, 'Widebody': 250 }[a.type] || 200;
    const pct = Math.min(100, Math.round((a.hours_logged / maxHours) * 100));
    const mstClass = a.maintenance_status === 'Airworthy' ? 'badge-success' : a.maintenance_status === 'Watch' ? 'badge-warning' : 'badge-danger';
    const statusClass = a.status === 'Active' ? 'badge-success' : 'badge-warning';
    return `
      <div class="card fleet-card">
        <div style="flex:1">
          <div class="card-title">${a.name}</div>
          <div class="card-sub">${a.type} · ${a.seats} seats · ${a.ownership} · ${a.registration}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="card-sub" style="margin-top:4px">${fmtHours(a.hours_logged)} logged · ${a.notes || ''}</div>
          <span class="badge ${mstClass}" style="margin-top:4px;display:inline-block">${a.maintenance_status}</span>
        </div>
        <span class="badge ${statusClass}">${a.status}</span>
      </div>`;
  }).join('');
}

// ── Routes ────────────────────────────────────────────
function renderRoutes() {
  const el = document.getElementById('routes-list');
  if (!el) return;
  const domestic = STATE.routes.filter(r => r.category === 'Domestic');
  const transatlantic = STATE.routes.filter(r => r.category === 'Transatlantic');
  let html = '';
  if (domestic.length) {
    html += '<div class="section-label">Domestic</div>';
    html += domestic.map(routeCard).join('');
  }
  if (transatlantic.length) {
    html += '<div class="section-label">Transatlantic</div>';
    html += transatlantic.map(routeCard).join('');
  }
  el.innerHTML = html;
}

function routeCard(r) {
  const dur = r.duration_min ? (Math.floor(r.duration_min / 60) + 'h' + (r.duration_min % 60 ? (r.duration_min % 60) + 'min' : '')) : '';
  return `
    <div class="card route-card">
      <div>
        <div class="route-airports">${r.origin} → ${r.destination}</div>
        <div class="card-sub">${[r.distance_nm ? r.distance_nm + 'nm' : '', r.aircraft_type, dur].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="text-align:right">
        <div class="revenue">${fmt$(r.revenue_per_flight)}/flt</div>
        <span class="badge badge-success" style="margin-top:3px;display:inline-block">${r.status}</span>
      </div>
    </div>`;
}

// ── Finances ──────────────────────────────────────────
function renderFinances() {
  const el = document.getElementById('finance-body');
  if (!el || !STATE.finances) return;
  const f = STATE.finances;
  const rows = [
    ['Total flight revenue', f.total_revenue, true],
    ['Staff pilot earnings (passive)', f.staff_earnings, true],
    ['Fleet purchases & leases', -f.fleet_costs, false],
    ['Staff salaries (cumulative)', -f.staff_salaries, false],
    ['Loan repayments to date', -f.loan_repayments, false],
    ['Loan drawdowns (lifetime)', f.loan_drawdowns, true],
    ['Outstanding debt', -f.debt, false],
  ];
  el.innerHTML = rows.map(([label, val, pos]) => `
    <div class="finance-row">
      <span class="finance-label">${label}</span>
      <span class="finance-value ${pos ? 'pos' : 'neg'}">${val < 0 ? '-' : ''}${fmt$(Math.abs(val))}</span>
    </div>`).join('') + `
    <div class="finance-row total-row">
      <span style="font-weight:500;color:var(--text)">Net cash on hand</span>
      <span class="finance-value pos" style="font-size:16px">${fmt$(f.cash)}</span>
    </div>`;
}

// ── Staff ─────────────────────────────────────────────
function renderStaff() {
  const el = document.getElementById('staff-list');
  if (!el) return;
  el.innerHTML = STATE.pilots.map(p => {
    const colorMap = {
      info: ['var(--color-bg-info)', 'var(--color-text-info)'],
      success: ['var(--color-bg-success)', 'var(--color-text-success)'],
      warning: ['var(--color-bg-warning)', 'var(--color-text-warning)'],
      danger: ['var(--color-bg-danger)', 'var(--color-text-danger)'],
      secondary: ['var(--color-bg-secondary)', 'var(--color-text-secondary)'],
    };
    const [bg, color] = colorMap[p.color_theme] || colorMap.secondary;
    return `
      <div class="card staff-card">
        <div class="pilot-avatar" style="background:${bg};color:${color}">${p.initials}</div>
        <div>
          <div class="card-title">${p.name}</div>
          <div class="card-sub">${p.role} · ${p.aircraft_type} · ${p.hub}</div>
        </div>
        <div class="pilot-earn">+${fmt$(p.earnings_per_flight)}/flt</div>
      </div>`;
  }).join('');
}

// ── Flight log ────────────────────────────────────────
function renderLog() {
  const el = document.getElementById('log-list');
  if (!el) return;
  const statusMap = {
    Completed: ['log-ok', 'Completed'],
    Incident: ['log-inc', 'Incident'],
    Diverted: ['log-div', 'Diverted'],
  };
  el.innerHTML = STATE.log.map(e => {
    const [cls, label] = statusMap[e.status] || ['log-ok', e.status];
    const date = e.logged_at ? new Date(e.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    return `
      <div class="log-entry">
        <div class="log-date">${date}</div>
        <div style="flex:1">
          <div class="log-route">${e.origin} → ${e.destination}</div>
          <div class="log-detail">${e.aircraft_type} · ${e.block_time || ''}${e.notes ? ' · ' + e.notes : ''}</div>
        </div>
        <span class="log-status ${cls}">${label}</span>
      </div>`;
  }).join('');
  const title = document.getElementById('log-title');
  if (title) title.textContent = `Flight log — ${STATE.totalFlights} flights · recent ${STATE.log.length} shown`;
}

// ── Dispatch pilot selector ────────────────────────────
function renderDispatchPilots() {
  const sel = document.getElementById('d-pic');
  if (!sel) return;
  sel.innerHTML = '<option value="player">You (player)</option>' +
    STATE.pilots.map(p => `<option value="${p.initials}">${p.name} — ${p.role}</option>`).join('');
}

// ── Dispatch aircraft selector ────────────────────────
function renderDispatchAircraft() {
  const sel = document.getElementById('d-aircraft');
  if (!sel) return;
  sel.innerHTML = STATE.fleet
    .filter(a => a.status === 'Active' && !a.locked)
    .map(a => `<option value="${a.registration}|${a.name}|${a.seats}">${a.name} — ${a.registration}</option>`)
    .join('');
}

// ── Util ──────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
