// aa-virtual/public/js/ofp.js
// Simbrief OFP parser — handles the key:value flat format

function parseOFP(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  function find(keys) {
    const keyArr = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArr) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase() === key.toLowerCase() && lines[i + 1]) {
          return lines[i + 1].trim();
        }
      }
    }
    return '';
  }

  const airline = find('Airline');
  const fltNum = find('Flight #');
  const dep = find('Departure');
  const arr = find('Arrival');
  const alt = find('Alternate');
  const ac = find('Aircraft');
  const date = find('Date');
  const airframe = find('Airframe');

  // Times — Departure and Arrival appear twice (header + time)
  // First occurrence is the ICAO, second is the time
  const depMatches = [];
  const arrMatches = [];
  lines.forEach((l, i) => {
    if (l === 'Departure' && lines[i + 1]) depMatches.push(lines[i + 1].trim());
    if (l === 'Arrival' && lines[i + 1]) arrMatches.push(lines[i + 1].trim());
  });
  const depIcao = depMatches[0] || '';
  const depTime = depMatches[1] || '';
  const arrIcao = arrMatches[0] || '';
  const arrTime = arrMatches[1] || '';

  const airTime = find('Air Time');
  const blkTime = find('Blk Time');
  const altitude = find('Altitude');
  const cruise = find('Cruise');
  const distance = find('Distance');
  const wind = find('Wind');
  const comp = find('Comp');
  const burn = find('Burn');
  const passengers = find('Passengers');
  const oew = find('OEW');
  const ezfw = find('EZFW');
  const etow = find('ETOW');
  const elw = find('ELW');
  const fuel = find('Fuel');
  const baggage = find('Baggage');
  const payload = find('Payload');
  const mzfw = find('MZFW');
  const mtow = find('MTOW');
  const mlw = find('MLW');
  const units = find('Units');

  // Route — everything after "Route" line
  let route = '';
  const routeIdx = lines.findIndex(l => l === 'Route');
  if (routeIdx !== -1 && lines[routeIdx + 1]) {
    route = lines[routeIdx + 1].trim();
  }

  // Flight level from altitude
  const flMatch = (altitude || '').match(/(\d{2,3}),?(\d{3})?/);
  let fl = '';
  if (flMatch) {
    const full = flMatch[0].replace(',', '');
    fl = 'FL' + Math.round(parseInt(full) / 100);
  }

  return {
    airline, fltNum,
    depIcao, arrIcao, alt,
    ac, airframe, date,
    depTime, arrTime, airTime, blkTime,
    altitude, fl, cruise, distance, wind, comp,
    burn, passengers, oew, ezfw, etow, elw,
    fuel, baggage, payload, mzfw, mtow, mlw, units,
    route,
    callsign: (airline || 'AAL') + (fltNum || ''),
  };
}

function renderOFPCard(p) {
  function row(label, val, unit) {
    if (!val) return '';
    const display = unit ? val + ' ' + unit : val;
    return `<div class="ofp-label">${label}</div><div class="ofp-val">${display}</div>`;
  }
  const u = p.units === 'KGS' ? 'kg' : 'lbs';

  document.getElementById('ofp-card').style.display = 'grid';

  const sections = [
    { title: 'Flight info', rows: [
      ['Callsign', p.callsign],
      ['Airline', p.airline],
      ['Departure', p.depIcao],
      ['Arrival', p.arrIcao],
      ['Alternate', p.alt],
      ['Aircraft', p.ac],
      ['Airframe', p.airframe],
      ['Date', p.date],
    ]},
    { title: 'Times', rows: [
      ['STD', p.depTime],
      ['STA', p.arrTime],
      ['Air time', p.airTime],
      ['Block time', p.blkTime],
    ]},
    { title: 'Performance', rows: [
      ['Altitude', p.altitude ? p.altitude + ' ft' : ''],
      ['Cruise', p.cruise],
      ['Distance', p.distance ? p.distance + ' nm' : ''],
      ['Wind', p.wind],
      ['Comp', p.comp],
    ]},
    { title: 'Load sheet — all weights in ' + (p.units || 'LBS'), rows: [
      ['Burn', p.burn ? Number(p.burn).toLocaleString() + ' ' + u : ''],
      ['Passengers', p.passengers],
      ['OEW', p.oew ? Number(p.oew).toLocaleString() + ' ' + u : ''],
      ['EZFW', p.ezfw ? Number(p.ezfw).toLocaleString() + ' ' + u : ''],
      ['ETOW', p.etow ? Number(p.etow).toLocaleString() + ' ' + u : ''],
      ['ELW', p.elw ? Number(p.elw).toLocaleString() + ' ' + u : ''],
      ['Fuel', p.fuel ? Number(p.fuel).toLocaleString() + ' ' + u : ''],
      ['Baggage', p.baggage ? Number(p.baggage).toLocaleString() + ' ' + u : ''],
      ['Payload', p.payload ? Number(p.payload).toLocaleString() + ' ' + u : ''],
      ['MZFW', p.mzfw ? Number(p.mzfw).toLocaleString() + ' ' + u : ''],
      ['MTOW', p.mtow ? Number(p.mtow).toLocaleString() + ' ' + u : ''],
      ['MLW', p.mlw ? Number(p.mlw).toLocaleString() + ' ' + u : ''],
    ]},
  ];

  document.getElementById('ofp-card').innerHTML = sections.map(s => `
    <div class="ofp-section-header">${s.title}</div>
    ${s.rows.filter(([, v]) => v).map(([l, v]) => `
      <div class="ofp-label">${l}</div>
      <div class="ofp-val">${v}</div>
    `).join('')}
  `).join('');

  if (p.route) {
    const re = document.getElementById('ofp-route');
    re.textContent = p.route;
    re.style.display = 'block';
  }
}

function buildATCBlock(parsed, picKey, seed, sq) {
  const pic = picKey === 'player' ? 'Player (you)' : picKey;
  return [
    `${parsed.callsign} | ${parsed.ac}${parsed.airframe ? ' (' + parsed.airframe + ')' : ''} | ${parsed.depIcao} → ${parsed.arrIcao}`,
    `SQ: ${sq} | CRZ: ${parsed.fl || 'FL350'} | Route: ${parsed.route || '[see OFP]'}`,
    `PAX: ${parsed.passengers || '—'} | Fuel: ${parsed.fuel || '—'} | ETD: ${parsed.depTime || '????'}Z`,
    `PIC: ${pic}`,
    `Event seed: ${seed}`,
  ].join('\n');
}
