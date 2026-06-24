// ============================================================
// GET /api/calendar?days=45
//   Read-only Google Calendar (or any) agenda feed.
//
// Reads the SECRET iCal URL(s) from the GCAL_ICS_URL Vercel env var
// (comma-separate multiple calendars), fetches the .ics text, parses
// the VEVENTs, expands common recurrences inside the window, and
// returns clean JSON the calendar.html page renders as a dark agenda.
//
// SETUP:
//   Google Calendar → Settings → (pick the calendar) → "Integrate
//   calendar" → copy the "Secret address in iCal format" URL, then in
//   Vercel → Settings → Environment Variables add:
//       GCAL_ICS_URL = https://calendar.google.com/calendar/ical/.../basic.ics
//   Redeploy. (Keep this URL private — it grants read access.)
//
// The URL is taken ONLY from the env var (never from the query string)
// so this can't be abused as an open proxy.
// ============================================================

const DAY_MS = 86400000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const raw = process.env.GCAL_ICS_URL || '';
  const urls = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!urls.length) {
    return res.status(200).send(JSON.stringify({ configured: false, events: [] }));
  }

  const days = Math.min(120, Math.max(1, parseInt(req.query.days, 10) || 45));
  const now = new Date();
  const windowStart = new Date(now.getTime() - DAY_MS);       // include things still happening today
  const windowEnd = new Date(now.getTime() + days * DAY_MS);

  try {
    const texts = await Promise.all(urls.map(async (u) => {
      // Google serves webcal:// sometimes — normalize to https.
      const httpUrl = u.replace(/^webcal:\/\//i, 'https://');
      const r = await fetch(httpUrl, { headers: { 'User-Agent': 'dashboard-calendar/1.0' } });
      if (!r.ok) throw new Error('feed ' + r.status);
      return r.text();
    }));

    let events = [];
    for (const t of texts) events = events.concat(parseICS(t, windowStart, windowEnd));

    events.sort((a, b) => (a.sort || '').localeCompare(b.sort || ''));
    // de-dupe identical (same title + start)
    const seen = new Set();
    events = events.filter(e => { const k = e.title + '|' + e.start; if (seen.has(k)) return false; seen.add(k); return true; });

    return res.status(200).send(JSON.stringify({ configured: true, generatedAt: now.toISOString(), count: events.length, events }));
  } catch (e) {
    return res.status(200).send(JSON.stringify({ configured: true, error: String(e && e.message || e), events: [] }));
  }
}

// ---------- ICS parsing ----------

function unfold(text) {
  // RFC5545 line folding: a CRLF followed by space/tab continues the line.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function parseICS(text, windowStart, windowEnd) {
  const lines = unfold(text).split('\n');
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) emitEvent(cur, out, windowStart, windowEnd); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const semi = left.indexOf(';');
    const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
    const params = {};
    if (semi !== -1) {
      left.slice(semi + 1).split(';').forEach(p => { const eq = p.indexOf('='); if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1); });
    }
    if (name === 'DTSTART') { cur.start = parseDate(value, params); cur.startRaw = value; }
    else if (name === 'DTEND') { cur.end = parseDate(value, params); }
    else if (name === 'SUMMARY') cur.title = unescapeText(value);
    else if (name === 'LOCATION') cur.location = unescapeText(value);
    else if (name === 'RRULE') cur.rrule = parseRRule(value);
    else if (name === 'UID') cur.uid = value;
  }
  return out;
}

function parseDate(value, params) {
  // Returns { y, m, d, hh, mm, ss, allDay, utc, tzid }
  const allDay = (params.VALUE === 'DATE') || /^\d{8}$/.test(value);
  if (allDay) {
    return { y: +value.slice(0, 4), m: +value.slice(4, 6), d: +value.slice(6, 8), hh: 0, mm: 0, ss: 0, allDay: true };
  }
  const utc = /Z$/.test(value);
  const v = value.replace(/Z$/, '');
  return {
    y: +v.slice(0, 4), m: +v.slice(4, 6), d: +v.slice(6, 8),
    hh: +v.slice(9, 11) || 0, mm: +v.slice(11, 13) || 0, ss: +v.slice(13, 15) || 0,
    allDay: false, utc, tzid: params.TZID || null
  };
}

// Convert a parsed date to a JS Date used only for windowing/recurrence math.
function toDate(p) {
  if (p.utc) return new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss));
  return new Date(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
}

// Serialize for the client: all-day → 'YYYY-MM-DD'; UTC instant → ISO Z;
// floating/tzid → naive local 'YYYY-MM-DDTHH:MM:SS' (rendered as wall-clock).
function serialize(p) {
  const pad = (n) => String(n).padStart(2, '0');
  if (p.allDay) return pad(p.y) + '-' + pad(p.m) + '-' + pad(p.d);
  if (p.utc) return toDate(p).toISOString();
  return p.y + '-' + pad(p.m) + '-' + pad(p.d) + 'T' + pad(p.hh) + ':' + pad(p.mm) + ':' + pad(p.ss);
}

function parseRRule(value) {
  const o = {};
  value.split(';').forEach(part => { const eq = part.indexOf('='); if (eq !== -1) o[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1); });
  return {
    freq: o.FREQ, interval: parseInt(o.INTERVAL, 10) || 1,
    count: o.COUNT ? parseInt(o.COUNT, 10) : null,
    until: o.UNTIL ? parseDate(o.UNTIL.replace(/Z$/, ''), {}) : null,
    byday: o.BYDAY ? o.BYDAY.split(',') : null
  };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function emitEvent(ev, out, windowStart, windowEnd) {
  if (!ev.start || !ev.title) return;
  const push = (startP) => {
    const sd = toDate(startP);
    if (sd < windowStart || sd > windowEnd) return;
    out.push({
      title: ev.title,
      start: serialize(startP),
      allDay: !!startP.allDay,
      location: ev.location || '',
      sort: sortKey(startP)
    });
  };

  if (!ev.rrule || !ev.rrule.freq) { push(ev.start); return; }

  // ---- recurrence expansion (bounded) ----
  const r = ev.rrule;
  const maxIters = 1000;
  let emitted = 0;
  const base = ev.start;
  const untilDate = r.until ? toDate(r.until) : null;

  const inWindow = (d) => d <= windowEnd && d >= windowStart;
  const passedEnd = (d) => d > windowEnd || (untilDate && d > untilDate) || (r.count && emitted >= r.count);

  if (r.freq === 'WEEKLY' && r.byday && r.byday.length) {
    // Expand week by week, hitting each BYDAY.
    let weekStart = startOfWeek(toDate(base));
    for (let i = 0; i < maxIters; i++) {
      for (const code of r.byday) {
        const dow = WEEKDAYS.indexOf(code.replace(/^[-+]?\d+/, ''));
        if (dow === -1) continue;
        const occ = addDays(weekStart, dow);
        const occP = withDate(base, occ);
        const occD = toDate(occP);
        if (r.count && emitted >= r.count) break;
        if (untilDate && occD > untilDate) break;
        if (occD < toDate(base)) continue;
        if (occD > windowEnd) break;
        if (inWindow(occD)) { push(occP); }
        if (occD >= toDate(base)) emitted++;
      }
      weekStart = addDays(weekStart, 7 * r.interval);
      if (toDate(withDate(base, weekStart)) > windowEnd) break;
      if (untilDate && weekStart > untilDate) break;
      if (r.count && emitted >= r.count) break;
    }
    return;
  }

  // DAILY / WEEKLY(no byday) / MONTHLY / YEARLY
  let cursor = clone(base);
  for (let i = 0; i < maxIters; i++) {
    const d = toDate(cursor);
    if (passedEnd(d)) break;
    if (inWindow(d)) push(cursor);
    if (d >= toDate(base)) emitted++;
    cursor = advance(cursor, r);
    if (r.count && emitted >= r.count) break;
  }
}

function clone(p) { return Object.assign({}, p); }
function withDate(base, jsDate) {
  return Object.assign({}, base, { y: jsDate.getFullYear(), m: jsDate.getMonth() + 1, d: jsDate.getDate() });
}
function advance(p, r) {
  const j = new Date(p.y, p.m - 1, p.d);
  if (r.freq === 'DAILY') j.setDate(j.getDate() + r.interval);
  else if (r.freq === 'WEEKLY') j.setDate(j.getDate() + 7 * r.interval);
  else if (r.freq === 'MONTHLY') j.setMonth(j.getMonth() + r.interval);
  else if (r.freq === 'YEARLY') j.setFullYear(j.getFullYear() + r.interval);
  else j.setDate(j.getDate() + 1);
  return withDate(p, j);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
function sortKey(p) {
  const pad = (n) => String(n).padStart(2, '0');
  return pad(p.y) + pad(p.m) + pad(p.d) + (p.allDay ? '0000' : pad(p.hh) + pad(p.mm));
}
function unescapeText(s) { return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
