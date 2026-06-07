// aa-virtual/public/js/ofp.js
// Simbrief OFP parser — handles both raw single-line and nicely spaced formats

const OFP_KEYS = [
  'Flight Number', 'Callsign', 'Departure', 'Arrival', 'Alternate',
  'Aircraft', 'Departure Date', 'Departure Time', 'Arrival Time',
  'Air Time', 'Block Time', 'Airframe',
  'Initial Altitude', 'Cruise Profile', 'Route Distance',
  'Average Wind', 'Wind Component', 'ISA Deviation',
  'Release Number', 'AIRAC Cycle', 'OFP Layout', 'Units', 'Navlog', 'ETOPS',
  'Enroute Burn', 'Passenger Count', 'Empty Weight',
  'Estimated ZFW', 'Estimated TOW', 'Estimated LW',
  'Block Fuel', 'Baggage', 'Payload',
  'Max ZFW', 'Max TOW', 'Max LW',
  'Route', 'Flight Plan Summary', 'Load Sheet- All weights in LBS',
  'Load Sheet- All weights in KGS',
];

function parseOFP(raw) {
  // Detect format: if raw has multiple newlines it's spaced, otherwise single-line
  const lineCount = (raw.match(/\n/g) || []).length;
  const map = lineCount > 5 ? parseSpaced(raw) : parseSingleLine(raw);
  return buildParsed(map);
}

// Spaced format: label on one line, value on next
function parseSpaced(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const SKIP = ['flight plan summary', 'load sheet- all weights in lbs', 'load sheet- all weights in kgs'];
  const map = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (SKIP.some(s => lower.includes(s))) { i++; continue; }
    const next = lines[i + 1];
    if (next && line.length < 50 && !line.match(/^[A-Z]{4}\//)) {
      map[lower] = next.trim();
      i += 2;
    } else { i++; }
  }
  return map;
}

// Single-line format: all text jammed together, use known keys as delimiters
function parseSingleLine(raw) {
  const map = {};
  // Sort keys longest first so we match "Departure Date" before "Departure"
  const sorted = [...OFP_KEYS].sort((a, b) => b.length - a.length);
  // Build regex that splits on any known key
  const escaped = sorted.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const splitter = new RegExp('(' + escaped.join('|') + ')', 'g');
  const parts = raw.split(splitter).filter(Boolean);

  let currentKey = null;
  for (const part of parts) {
    if (OFP_KEYS.some(k => k.toLowerCase() === part.toLowerCase())) {
      currentKey = part.toLowerCase();
    } else if (currentKey) {
      const val = part.trim();
      if (val && !map[currentKey]) map[currentKey] = val;
      currentKey = null;
    }
  }
  return map;
}

function buildParsed(map) {
  function get(...keys) {
    for (const k of keys) {
      const v = map[k.toLowerCase()];
      if (v) return v.trim();
    }
    return '';
  }

  function extractICAO(str) {
    if (!str) return '';
    const m = str.match(/([A-Z]{4})/);
    return m ? m[1] : '';
  }

  function parseFL(altStr) {
    if (!altStr) return '';
    const m = altStr.replace(/,/g, '').match(/(\d+)/);
    if (!m) return '';
    return 'FL' + Math.round(parseInt(m[1]) / 100);
  }

  function parseTime(str) {
    if (!str) return '';
    return str.replace(' UTC', '').replace(':', '').substring(0, 4);
  }

  const depRaw = get('departure');
  const arrRaw = get('arrival');
  const altRaw = get('alternate');
  const callsign = get('callsign', 'flight number');
  const airline = callsign ? callsign.replace(/\d+/g, '') : 'AAL';

  // Route — strip runway designators from start/end
  let route = get('route');
  if (route) {
    route = route
      .replace(/^[A-Z]{4}\/\d{2}[LRC]?\s+/, '')
      .replace(/\s+[A-Z]{4}\/\d{2}[LRC]?$/, '')
      .trim();
  }

  const depTime = parseTime(get('departure time'));
  const arrTime = parseTime(get('arrival time'));

  return {
    airline,
    callsign,
    fltNum: get('flight number', 'callsign'),
    depIcao: extractICAO(depRaw),
    arrIcao: extractICAO(arrRaw),
    altIcao: extractICAO(altRaw),
    ac: get('aircraft'),
    airframe: get('airframe'),
    date: get('departure date'),
    depTime,
    arrTime,
    airTime: get('air time'),
    blkTime: get('block time'),
    fl: parseFL(get('initial altitude', 'altitude')),
    dist: get('route distance', 'distance'),
    wind: get('average wind', 'wind'),
    comp: get('wind component'),
    cruise: get('cruise profile', 'cruise'),
    isa: get('isa deviation'),
    units: get('units'),
    pax: get('passenger count', 'passengers'),
    fuel: get('block fuel', 'fuel'),
    burn: get('enroute burn', 'burn'),
    payload: get('payload'),
    baggage: get('baggage'),
    oew: get('empty weight'),
    ezfw: get('estimated zfw'),
    etow: get('estimated tow'),
    elw: get('estimated lw'),
    mzfw: get('max zfw'),
    mtow: get('max tow'),
    mlw: get('max lw'),
    route,
  };
}

function renderOFPCard(p) {
  const card = document.getElementById('ofp-card');
  if (!card) return;
  const u = (p.units || 'LBS').toUpperCase() === 'KGS' ? 'kg' : 'lbs';

  function fmtW(val) {
    if (!val) return '';
    const n = parseInt(val.replace(/[^0-9]/g, ''));
    return isNaN(n) ? val : n.toLocaleString() + ' ' + u;
  }

  const sections = [
    { title: 'Flight info', rows: [
      ['Callsign', p.callsign],
      ['Departure', p.depIcao],
      ['Arrival', p.arrIcao],
      ['Alternate', p.altIcao],
      ['Aircraft', p.ac],
      ['Airframe', p.airframe],
      ['Date', p.date],
    ]},
    { title: 'Times', rows: [
      ['STD', p.depTime ? p.depTime.slice(0,2)+':'+p.depTime.slice(2)+'Z' : ''],
      ['STA', p.arrTime ? p.arrTime.slice(0,2)+':'+p.arrTime.slice(2)+'Z' : ''],
      ['Air time', p.airTime],
      ['Block time', p.blkTime],
    ]},
    { title: 'Performance', rows: [
      ['Initial altitude', p.fl],
      ['Cruise profile', p.cruise],
      ['Distance', p.dist],
      ['Avg wind', p.wind],
      ['Wind comp', p.comp],
      ['ISA dev', p.isa],
    ]},
    { title: 'Load sheet — all weights in ' + u, rows: [
      ['Passengers', p.pax],
      ['Payload', fmtW(p.payload)],
      ['Baggage', fmtW(p.baggage)],
      ['Enroute burn', fmtW(p.burn)],
      ['Block fuel', fmtW(p.fuel)],
      ['Est. ZFW', fmtW(p.ezfw)],
      ['Est. TOW', fmtW(p.etow)],
      ['Est. LW', fmtW(p.elw)],
      ['Max ZFW', fmtW(p.mzfw)],
      ['Max TOW', fmtW(p.mtow)],
      ['Max LW', fmtW(p.mlw)],
    ]},
  ];

  card.innerHTML = sections.map(s => `
    <div class="ofp-section-header">${s.title}</div>
    ${s.rows.filter(([,v]) => v).map(([l,v]) => `
      <div class="ofp-label">${l}</div>
      <div class="ofp-val">${v}</div>
    `).join('')}
  `).join('');
  card.style.display = 'grid';

  if (p.route) {
    const re = document.getElementById('ofp-route');
    if (re) { re.textContent = p.route; re.style.display = 'block'; }
  }
}

function buildATCBlock(parsed, picKey, seed, sq) {
  const pic = picKey === 'player' ? 'Player (you)' : picKey;
  const etd = parsed.depTime
    ? parsed.depTime.slice(0,2) + ':' + parsed.depTime.slice(2) + 'Z'
    : '????Z';
  return [
    `${parsed.callsign || 'AAL???'} | ${parsed.ac || '????'} (${parsed.airframe || '????'}) | ${parsed.depIcao || '????'} → ${parsed.arrIcao || '????'}`,
    `SQ: ${sq} | CRZ: ${parsed.fl || 'FL350'} | Route: ${parsed.route || '[see OFP]'}`,
    `PAX: ${parsed.pax || '—'} | Fuel: ${parsed.fuel || '—'} | ETD: ${etd}`,
    `PIC: ${pic}`,
    `Event seed: ${seed}`,
  ].join('\n');
}
