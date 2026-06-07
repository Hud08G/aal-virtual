// aa-virtual/public/js/ofp.js
// Simbrief OFP parser — handles Simbrief's label-per-line / value-per-line format

function parseOFP(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // Build a key-value map — every odd line is a label, every even line is its value
  // But we need to be smart: some lines are pure section headers with no value
  const SECTION_HEADERS = [
    'flight plan summary', 'load sheet- all weights in lbs',
    'load sheet- all weights in kgs', 'load sheet', 'flight plan',
  ];

  const map = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lower = line.toLowerCase();
    // Skip section headers
    if (SECTION_HEADERS.some(h => lower.includes(h))) { i++; continue; }
    // If next line exists and doesn't look like a label (labels are short, title-case-ish)
    const next = lines[i + 1];
    if (next !== undefined) {
      // Heuristic: if the current line looks like a label (no digits, no slashes, not too long)
      // and the next line looks like a value
      const looksLikeLabel = line.length < 40 && !line.match(/^\d/) && !line.match(/^[A-Z]{4}\//);
      const nextLooksLikeValue = next.length > 0;
      if (looksLikeLabel && nextLooksLikeValue) {
        map[lower] = next.trim();
        i += 2;
        continue;
      }
    }
    i++;
  }

  function get(...keys) {
    for (const k of keys) {
      if (map[k.toLowerCase()]) return map[k.toLowerCase()];
    }
    return '';
  }

  // Parse route — find the line after "Route" label
  let route = get('route');
  // Clean up route — remove runway designators at start/end
  if (route) {
    route = route.replace(/^[A-Z]{4}\/\d{2}[LRC]?\s*/, '').replace(/\s*[A-Z]{4}\/\d{2}[LRC]?$/, '').trim();
  }

  // Parse ICAO codes from Departure/Arrival fields e.g. "KMIA / MIA"
  function extractICAO(str) {
    if (!str) return '';
    const m = str.match(/^([A-Z]{4})/);
    return m ? m[1] : str.split('/')[0].trim();
  }

  const depRaw = get('departure');
  const arrRaw = get('arrival');
  const altRaw = get('alternate');

  const depIcao = extractICAO(depRaw);
  const arrIcao = extractICAO(arrRaw);
  const altIcao = extractICAO(altRaw);

  // Parse altitude — "35,000 ft" → "FL350"
  const altRaw2 = get('initial altitude', 'altitude', 'crz alt');
  let fl = '';
  if (altRaw2) {
    const m = altRaw2.replace(/,/g, '').match(/(\d+)/);
    if (m) fl = 'FL' + Math.round(parseInt(m[1]) / 100);
  }

  // Flight number — try a few label variants
  const callsign = get('callsign', 'flight number', 'flight #');
  const fltNum = get('flight number', 'flight #', 'callsign');

  // Aircraft
  const ac = get('aircraft', 'aircraft type');

  // Times
  const depTime = get('departure time').replace(' UTC', '').replace(':', '').substring(0, 4);
  const arrTime = get('arrival time').replace(' UTC', '').replace(':', '').substring(0, 4);
  const airTime = get('air time');
  const blkTime = get('block time');

  // Load sheet
  const pax = get('passenger count', 'passengers');
  const fuel = get('block fuel', 'fuel');
  const burn = get('enroute burn', 'burn');
  const payload = get('payload');
  const baggage = get('baggage');
  const oew = get('empty weight', 'oew');
  const ezfw = get('estimated zfw', 'ezfw');
  const etow = get('estimated tow', 'etow');
  const elw = get('estimated lw', 'elw');
  const mzfw = get('max zfw', 'mzfw');
  const mtow = get('max tow', 'mtow');
  const mlw = get('max lw', 'mlw');

  // Performance
  const dist = get('route distance', 'distance');
  const wind = get('average wind', 'wind');
  const comp = get('wind component', 'comp');
  const cruise = get('cruise profile', 'cruise', 'ci');
  const isa = get('isa deviation', 'isa dev');
  const units = get('units');
  const airframe = get('airframe');
  const date = get('departure date', 'date');
  const airline = callsign ? callsign.replace(/\d+/, '') : 'AAL';

  return {
    airline, callsign, fltNum,
    depIcao, arrIcao, altIcao,
    ac, airframe, date,
    depTime, arrTime, airTime, blkTime,
    fl, dist, wind, comp, cruise, isa, units,
    pax, fuel, burn, payload, baggage,
    oew, ezfw, etow, elw, mzfw, mtow, mlw,
    route,
  };
}

function renderOFPCard(p) {
  const card = document.getElementById('ofp-card');
  if (!card) return;

  const u = (p.units || 'LBS').toUpperCase() === 'KGS' ? 'kg' : 'lbs';

  function fmtWeight(val) {
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
      ['STD', p.depTime ? p.depTime.slice(0,2) + ':' + p.depTime.slice(2) + 'Z' : ''],
      ['STA', p.arrTime ? p.arrTime.slice(0,2) + ':' + p.arrTime.slice(2) + 'Z' : ''],
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
      ['Payload', fmtWeight(p.payload)],
      ['Baggage', fmtWeight(p.baggage)],
      ['Enroute burn', fmtWeight(p.burn)],
      ['Block fuel', fmtWeight(p.fuel)],
      ['Est. ZFW', fmtWeight(p.ezfw)],
      ['Est. TOW', fmtWeight(p.etow)],
      ['Est. LW', fmtWeight(p.elw)],
      ['Max ZFW', fmtWeight(p.mzfw)],
      ['Max TOW', fmtWeight(p.mtow)],
      ['Max LW', fmtWeight(p.mlw)],
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
  const etd = parsed.depTime ? parsed.depTime.slice(0,2) + ':' + parsed.depTime.slice(2) + 'Z' : '????Z';
  return [
    `${parsed.callsign || 'AAL???'} | ${parsed.ac || '????'} (${parsed.airframe || '????'}) | ${parsed.depIcao || '????'} → ${parsed.arrIcao || '????'}`,
    `SQ: ${sq} | CRZ: ${parsed.fl || 'FL350'} | Route: ${parsed.route || '[see OFP]'}`,
    `PAX: ${parsed.pax || '—'} | Fuel: ${parsed.fuel || '—'} | ETD: ${etd}`,
    `PIC: ${pic}`,
    `Event seed: ${seed}`,
  ].join('\n');
}
