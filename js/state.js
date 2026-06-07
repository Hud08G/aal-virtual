// aa-virtual/public/js/state.js
// Central state manager — reads/writes Supabase, drives UI

const SUPABASE_URL = 'https://docbvjmjossefcqgpvso.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvY2J2am1qb3NzZWZjcWdwdnNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTI3MjgsImV4cCI6MjA5NjM4ODcyOH0.hXlGYxZnUoBGaY3ouh2M05XPDteGqLo6erN6EzFfBws';

let sb;

async function initSupabase() {
  const { createClient } = supabase;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ── State ──────────────────────────────────────────────
let STATE = {
  fleet: [],
  routes: [],
  pilots: [],
  log: [],
  finances: null,
  hubs: [],
  totalFlights: 247,
};

// ── Loaders ────────────────────────────────────────────
async function loadAll() {
  const [fleet, routes, pilots, log, finances, hubs] = await Promise.all([
    sb.from('fleet').select('*').order('hours_logged', { ascending: false }),
    sb.from('routes').select('*').order('category').order('revenue_per_flight', { ascending: false }),
    sb.from('pilots').select('*'),
    sb.from('flight_log').select('*').order('logged_at', { ascending: false }).limit(20),
    sb.from('finances').select('*').single(),
    sb.from('hubs').select('*'),
  ]);
  STATE.fleet = fleet.data || [];
  STATE.routes = routes.data || [];
  STATE.pilots = pilots.data || [];
  STATE.log = log.data || [];
  STATE.finances = finances.data;
  STATE.hubs = hubs.data || [];
  STATE.totalFlights = (log.data || []).length + 247; // offset from seed
}

// ── Flight logging ─────────────────────────────────────
async function logFlight({ flightNumber, origin, destination, aircraftType, registration, blockTime, pilotId, status, notes, revenue, eventSeed }) {
  // Insert flight log entry
  await sb.from('flight_log').insert({
    flight_number: flightNumber,
    origin,
    destination,
    aircraft_type: aircraftType,
    aircraft_registration: registration,
    block_time: blockTime,
    pilot_id: pilotId || null,
    status,
    notes,
    revenue: revenue || 0,
    event_seed: eventSeed || null,
  });

  // Parse block time to decimal hours e.g. "2h41" → 2.68
  const hoursAdded = parseBlockTime(blockTime);

  // Tick aircraft hours
  const aircraft = STATE.fleet.find(a => a.type_key === aircraftType || a.registration === registration);
  if (aircraft) {
    const newHours = (aircraft.hours_logged || 0) + hoursAdded;
    await sb.from('fleet').update({ hours_logged: newHours }).eq('id', aircraft.id);

    // Check 787 unlock
    if (aircraftType === '777-300ER' && newHours >= 40) {
      await sb.from('fleet').update({ locked: false }).eq('registration', 'N789AA');
    }

    // Update maintenance watch threshold
    if (newHours > 300 && aircraft.maintenance_status === 'Airworthy') {
      await sb.from('fleet').update({ maintenance_status: 'Watch' }).eq('id', aircraft.id);
    }
  }

  // Add revenue to finances
  if (revenue > 0) {
    const fin = STATE.finances;
    await sb.from('finances').update({
      cash: fin.cash + revenue,
      total_revenue: fin.total_revenue + revenue,
      updated_at: new Date().toISOString(),
    }).eq('id', fin.id);
  }

  // Tick pilot flights
  if (pilotId) {
    const pilot = STATE.pilots.find(p => p.id === pilotId);
    if (pilot) {
      const updates = { flights_logged: (pilot.flights_logged || 0) + 1 };
      if (status === 'Incident' || status === 'Diverted') {
        updates.incidents_attributed = (pilot.incidents_attributed || 0) + 1;
      }
      // Pilot skill growth — tier advances every 20 flights, capped at 5
      if (updates.flights_logged % 20 === 0 && pilot.tier < 5) {
        updates.tier = pilot.tier + 1;
      }
      await sb.from('pilots').update(updates).eq('id', pilotId);
    }
  }

  // Reload state and re-render
  await loadAll();
  renderAll();
}

// ── Swiss cheese seed roller ───────────────────────────
const PILOT_TIER_MAP = { player: 5 };
const AC_WEAR_MAP = { 'E175': 0.15, '737-800': 0.22, 'A320neo': 0.12, '777-300ER': 0.28 };
const EVENT_POOL = [
  'Bird strike reported on departure corridor — monitor engine readings',
  'De-ice queue buildup at gate — possible +20min ground delay',
  'Fatigue flag on crew — watch for procedural shortcuts during cruise',
  'Minor hydraulic pressure fluctuation noted pre-departure',
  'SIGMET active on route — convective activity possible en route',
  'Catering unit struck aft fuselage during loading — inspection required',
  'ATC staffing shortage at destination TRACON — expect sequencing delays',
  'Fuel discrepancy between Simbrief and ramp crew — verify before pushback',
  'Reported FOD on departure runway — expedited inspection cleared',
  'Passenger medical event during boarding — 18min delay at gate',
  'APU snag — external power required for pushback, ground ops coordinating',
  'Gate conflict at destination — expect hold-short or remote stand',
];

function rollEventSeed(picKey, acType) {
  const pilot = STATE.pilots.find(p => p.initials === picKey) || { tier: PILOT_TIER_MAP[picKey] || 2 };
  const tier = pilot.tier || 2;
  const wear = AC_WEAR_MAP[acType] || 0.15;
  const hubBonus = 0; // future: hub upgrade reduces this
  const chance = Math.max(0.04, 0.14 + wear - (tier * 0.04) - hubBonus);
  if (Math.random() > chance) return 'None';
  return 'Active — ' + EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
}

// ── Helpers ────────────────────────────────────────────
function parseBlockTime(str) {
  if (!str) return 0;
  const m = str.match(/(\d+)h(\d+)?/);
  if (!m) return parseFloat(str) || 0;
  return parseInt(m[1]) + (parseInt(m[2] || 0) / 60);
}

function fmt$(n) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function fmtHours(h) {
  return Math.round(h * 10) / 10 + 'h';
}

// ── Auth (ops panel lock) ──────────────────────────────
let isAuthenticated = false;
const OPS_PASSWORD = 'YOUR_OPS_PASSWORD'; // change this

function checkAuth() {
  const stored = sessionStorage.getItem('aa_ops_auth');
  if (stored === OPS_PASSWORD) {
    isAuthenticated = true;
    return true;
  }
  return false;
}

function promptAuth() {
  const pw = prompt('Ops panel password:');
  if (pw === OPS_PASSWORD) {
    sessionStorage.setItem('aa_ops_auth', pw);
    isAuthenticated = true;
    return true;
  }
  return false;
}
