'use strict';
/* Trainingsapp – Oberfläche. Logik liegt in logic.js, Daten im localStorage des Geräts. */

const L = window.Logic;
const { normKey, round1, todayISO, dayNum, addDaysISO, parseNum, parseInt0, fmtNum, fmtSet, fmtSets, fmtPct, fmtDate,
  isValidSet, validSets, sessionOrder, doneSessions, previousEntry, exerciseHistory, compareSets, analyzeExercise,
  latestProgress, planProgress, forecastFor, forecastText, planForecast, blocks, normalizeGroups, e1rm, bestE1 } = L;

const STORE_KEY = 'trainingsapp.v1'; // Name des Speicherplatzes bleibt gleich, die Datenversion steht in db.version
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- Speicher ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return L.migrate(JSON.parse(raw));
  } catch (e) { console.error('Laden fehlgeschlagen', e); }
  return L.freshDb();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Speichern fehlgeschlagen!'); }
}
let db = load();
L.setDb(db);
save();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const getPlan = id => db.plans.find(p => p.id === id);
const getSession = id => db.sessions.find(s => s.id === id);
const activePlan = () => getPlan(db.activePlanId) || db.plans[0] || null;
const activeSession = () => db.sessions.find(s => s.status === 'active');
const untouched = L.isUntouched;
const sessionLabel = s => s.kind === 'baseline' ? 'Startwerte' : `${esc(s.planName)}${s.unitName ? ' · ' + esc(s.unitName) : ''}`;

/* ---- Icons: selbst gezeichnete SVG-Linien-Icons (24×24, Farbe über currentColor) ---- */
const ICON_PATHS = {
  plans: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4.5V3h6v1.5"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  progress: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  outlook: '<path d="M3 18l5-5 3 2.5 3.5-4"/><path d="M15.5 10.5l2-2.3M19 6.5l1.5-1.7" stroke-dasharray="1.6 2.4"/><circle cx="20.5" cy="4.8" r="1.2" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  note: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  faceGood: '<circle cx="12" cy="12" r="9"/><path d="M7.8 13.8c1.1 2 2.5 3 4.2 3s3.1-1 4.2-3"/><path d="M9 9.6v.6M15 9.6v.6" stroke-width="2.6"/>',
  faceOk: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15.3h7"/><path d="M9 9.6v.6M15 9.6v.6" stroke-width="2.6"/>',
  faceBad: '<circle cx="12" cy="12" r="9"/><path d="M7.8 16.8c1.1-1.8 2.5-2.6 4.2-2.6s3.1.8 4.2 2.6"/><path d="M9 9.6v.6M15 9.6v.6" stroke-width="2.6"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  coach: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8.5 10.5l2.5 2.5 4.5-4.5"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 3h4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4"/><path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/>',
  // Ampel-Symbole (gefüllt), damit die Bewertung auch ohne Farbe lesbar bleibt
  stUp: '<path d="M12 5.5l7 11H5z" fill="currentColor" stroke-width="1.5"/>',
  stSame: '<path d="M6 9.5h12M6 14.5h12" stroke-width="3"/>',
  stDown: '<path d="M12 18.5l7-11H5z" fill="currentColor" stroke-width="1.5"/>',
  stNone: '<circle cx="12" cy="12" r="6" stroke-width="2.6"/>',
  stSkip: '<path d="M6.5 12h11" stroke-width="3"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

/* ---- Logo: Dackel im Neon-Stil ---- */
const DACKEL = `<svg class="brand-dog" viewBox="22 22 228 106" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M180 64 C166 57 92 55 64 59 C46 61 41 79 49 93 L49 116 L60 116 L62 98 C92 102 138 102 154 98 L156 116 L167 116 L169 95 C180 91 186 80 180 64 Z"/>
  <path d="M50 68 C38 62 31 50 30 38"/>
  <path d="M176 62 C177 47 184 37 195 35 C204 33 210 36 215 41 L235 53 C239 56 237 61 231 61 L207 61 C200 63 192 67 186 71"/>
  <path d="M196 39 C185 45 185 62 194 66 C201 61 203 49 196 39 Z"/>
  <circle cx="207" cy="45" r="3.4" fill="currentColor" stroke="none"/><circle cx="235" cy="56" r="3.6" fill="currentColor" stroke="none"/></svg>`;

/* ---- Körperansicht: trainierte Muskelbereiche (vorne/hinten) ----
   Linke Körperhälfte wird gezeichnet und für rechts gespiegelt (Mitte x = 100). */
const BODY = {
  front: {
    neutral: [
      '<circle cx="100" cy="30" r="19"/>', '<path d="M91 47 L109 47 L111 62 L89 62 Z"/>',
      'L:<path d="M71 186 L98 192 L98 206 L70 198 Z"/>',
      'L:<path d="M72 300 C69 328 71 356 75 384 L89 384 C93 356 94 328 91 300 C85 296 77 296 72 300 Z"/>',
      'L:<ellipse cx="48" cy="210" rx="7" ry="10"/>',
    ],
    muscles: {
      traps: 'M98 62 L98 70 L80 72 C86 66 92 63 98 62 Z',
      shoulders: 'M78 72 C63 66 50 74 47 92 C49 100 53 104 58 105 C60 94 65 83 78 76 Z',
      chest: 'M98 74 L98 113 C88 119 72 117 64 107 C62 96 66 84 79 77 C86 73 92 72 98 74 Z',
      biceps: 'M56 108 C50 118 47 133 49 147 C53 151 59 151 63 147 C66 133 66 120 63 110 Z',
      forearms: 'M49 153 C45 169 43 185 44 199 L53 199 C57 185 61 169 62 153 Z',
      abs: 'M89 119 L98 121 L98 183 C94 186 91 185 89 181 Z',
      obliques: 'M87 119 C77 121 70 131 70 147 C72 163 77 176 87 182 Z',
      quads: 'M70 199 C66 222 66 251 70 280 C74 292 84 295 92 289 C96 263 96 229 94 207 C86 202 78 199 70 199 Z',
      adductors: 'M95 208 L98 209 L98 247 C97 251 95 253 93 253 C95 237 96 222 95 208 Z',
    },
  },
  back: {
    neutral: [
      '<circle cx="100" cy="30" r="19"/>', '<path d="M91 47 L109 47 L111 58 L89 58 Z"/>',
      'L:<path d="M74 352 C73 364 74 374 76 384 L89 384 C91 374 91 362 89 352 Z"/>',
      'L:<ellipse cx="48" cy="210" rx="7" ry="10"/>',
    ],
    muscles: {
      traps: 'M98 56 L98 106 C92 99 85 88 78 74 C85 66 92 60 98 56 Z',
      reardelts: 'M77 72 C63 66 50 74 47 92 C49 100 53 104 58 105 C60 94 65 83 77 76 Z',
      upperback: 'M97 108 C88 102 81 92 77 80 C71 90 71 102 76 111 C84 115 91 115 97 114 Z',
      lats: 'M76 115 C70 110 67 103 65 106 C63 126 69 151 85 171 C91 160 95 143 96 127 L96 117 Z',
      lowerback: 'M98 128 C97 146 94 162 89 175 C93 180 96 182 98 182 Z',
      triceps: 'M56 108 C50 118 47 133 49 147 C53 151 59 151 63 147 C66 133 66 120 63 110 Z',
      forearms: 'M49 153 C45 169 43 185 44 199 L53 199 C57 185 61 169 62 153 Z',
      glutes: 'M98 187 C88 183 75 185 70 197 C67 213 73 227 87 229 C93 228 98 222 98 211 Z',
      hamstrings: 'M70 232 C68 253 70 273 74 290 C80 297 88 297 94 291 C96 271 96 250 94 233 C86 235 77 235 70 232 Z',
      calves: 'M73 302 C66 316 66 334 72 348 C78 355 86 353 90 345 C94 331 92 314 88 302 C83 299 77 299 73 302 Z',
    },
  },
};
const mirror = svg => `<g transform="translate(200,0) scale(-1,1)">${svg}</g>`;
function bodySVG(side, load) {
  const b = BODY[side];
  let g = '<g class="bm-neutral">';
  for (const n of b.neutral) g += n.startsWith('L:') ? n.slice(2) + mirror(n.slice(2)) : n;
  g += '</g>';
  for (const [id, d] of Object.entries(b.muscles)) {
    const lv = L.muscleLevel(load[id]);
    const p = `<path d="${d}"/>`;
    g += `<g class="bm bm-${lv}" data-m="${id}">${p}${mirror(p)}</g>`;
  }
  return `<svg class="body-svg" viewBox="36 6 128 382" role="img" aria-label="Körper ${side === 'front' ? 'vorne' : 'hinten'}">${g}</svg>`;
}
/** Körperansicht zum Antippen (Pump-Auswahl): trainierte Muskeln hervorgehoben, gewählte leuchten. */
function bodyPickSVG(side, trained, selected) {
  const b = BODY[side];
  let g = '<g class="bm-neutral">';
  for (const n of b.neutral) g += n.startsWith('L:') ? n.slice(2) + mirror(n.slice(2)) : n;
  g += '</g>';
  for (const [id, d] of Object.entries(b.muscles)) {
    const p = `<path d="${d}"/>`;
    g += `<g class="bm-pick ${selected.includes(id) ? 'sel' : ''} ${trained.includes(id) ? 'tr' : 'dim'}" data-act="ci-pump" data-m="${id}" role="button" aria-pressed="${selected.includes(id)}" aria-label="${esc(L.muscleName(id))}">${p}${mirror(p)}</g>`;
  }
  return `<svg class="body-svg pick" viewBox="36 6 128 382" aria-label="Körper ${side === 'front' ? 'vorne' : 'hinten'}">${g}</svg>`;
}
function bodyMap(plan) {
  const { load, unknown } = L.planMuscleLoad(plan);
  const by = lv => L.MUSCLES.filter(([id]) => L.muscleLevel(load[id]) === lv).map(([, n]) => n);
  const lines = [[3, 'Stark'], [2, 'Mittel'], [1, 'Leicht']].map(([lv, t]) => by(lv).length ? `<div class="bm-line"><span class="bm-dot bm-${lv}"></span><b>${t}:</b> ${by(lv).join(', ')}</div>` : '').join('');
  const none = by(0);
  return `<div class="bodymap"><div class="bm-figs"><figure>${bodySVG('front', load)}<figcaption>vorne</figcaption></figure>
    <figure>${bodySVG('back', load)}<figcaption>hinten</figcaption></figure></div>
    <div class="bm-legend">${lines}${none.length ? `<div class="bm-line muted"><span class="bm-dot bm-0"></span><b>Kaum:</b> ${none.join(', ')}</div>` : ''}
    ${unknown.length ? `<div class="bm-line muted small">Nicht zugeordnet: ${unknown.map(esc).join(', ')}</div>` : ''}</div></div>`;
}

/* ---------------- Gemeinsame Bausteine ---------------- */
function topbar(title, back = '#/', home = false) {
  return `<header class="topbar"><a class="back" href="${back}">${icon('back')}Zurück</a><h1>${esc(title)}</h1>
    ${home ? `<a class="home" href="#/" aria-label="Startseite">${icon('home')}</a>` : '<span class="home-ph"></span>'}</header>`;
}
const STATUS = {
  up: { label: 'Stärker', icon: 'stUp' },
  same: { label: 'Stagnation', icon: 'stSame' },
  down: { label: 'Schwächer', icon: 'stDown' },
  none: { label: 'Kein Vergleich', icon: 'stNone' },
  skipped: { label: 'Übersprungen', icon: 'stSkip' },
  fup: { label: 'Steigend', icon: 'stUp' },
  fflat: { label: 'Kein Anstieg', icon: 'stSame' },
  ffew: { label: 'Zu wenig Daten', icon: 'stNone' },
};
const CLS = { up: 'up', same: 'same', down: 'down', none: 'grey', skipped: 'grey', fup: 'up', fflat: 'same', ffew: 'grey' };
function statusRow({ st, name, text, meta, href, perDumbbell, prs = [], feel }) {
  return `<a class="prow s-${CLS[st]}" href="${href}">
    <div class="prow-top"><span class="pname">${esc(name)}${perDumbbell ? ' <span class="pd">pro Hantel</span>' : ''}${feel ? ' ' + feelChip(feel) : ''}</span>
    <span class="st">${icon(STATUS[st].icon)}${STATUS[st].label}</span></div>
    ${prs.map(r => `<div class="pr-line">${icon('trophy')}${esc(r.text)}</div>`).join('')}
    <div class="ptext">${esc(text)}</div>${meta ? `<div class="pmeta">${meta}</div>` : ''}</a>`;
}
/** Kompakte Zeile: Name, kurze Kennzahl, Mini-Kurve und Ampel-Symbol. Details gibt es beim Antippen. */
function compactRow({ st, name, delta, spark, href }) {
  return `<a class="prow compact s-${CLS[st]}" href="${href}" aria-label="${esc(name)}: ${STATUS[st].label}, ${esc(delta)}">
    <div class="c-main"><span class="pname">${esc(name)}</span><span class="c-delta">${esc(delta)}</span></div>
    ${spark}<span class="c-st" title="${STATUS[st].label}">${icon(STATUS[st].icon)}</span><span class="c-go">›</span></a>`;
}
/** Mini-Kurve (geschätztes 1RM der letzten Trainings). */
function sparkline(values) {
  if (values.length < 2) return '<span class="spark spark-empty"></span>';
  const W = 72, H = 28, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [2 + i * (W - 4) / (values.length - 1), H - 3 - (v - lo) * (H - 6) / span]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map(p => p.join(',')).join(' ')}"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6"/></svg>`;
}
/** Liste mit Zwischenüberschriften für Supersätze. rowFn(ex) liefert HTML einer Zeile. */
function groupedList(exs, rowFn) {
  return blocks(exs).map(b => b.group
    ? `<div class="sub">Supersatz ${esc(b.group)}</div>${b.items.map(i => rowFn(i.ex, i.idx)).join('')}`
    : b.items.map(i => rowFn(i.ex, i.idx)).join('')).join('');
}

/* ---- SVG-Liniengrafik ---- */
function niceStep(range) {
  const raw = range / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
}
/**
 * points: [{d, y}] durchgezogen; forecast: {d, y} gestrichelt ab dem letzten Punkt.
 * timeScale: x nach Datum, sonst gleichmäßig nach Reihenfolge.
 */
function lineChart({ points, forecast = null, curve = null, unit = '', timeScale = false, zero = false }) {
  if (!points.length) return '<p class="empty small">Noch keine Daten für die Grafik.</p>';
  if (timeScale) { const m = new Map(); points.forEach(p => m.set(p.d, p)); points = [...m.values()]; }
  if (curve && curve.length) forecast = curve[curve.length - 1];
  const W = 340, H = 200, Lp = 42, R = 16, T = 22, B = 28;
  const ys = points.map(p => p.y).concat(forecast ? [forecast.y] : []).concat(curve ? curve.map(c => c.y) : []).concat(zero ? [0] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (hi - lo < step * 2) hi = lo + step * 2;
  const xsRaw = points.map((p, i) => timeScale ? dayNum(p.d) : i);
  const xEnd = forecast ? dayNum(forecast.d) : xsRaw[xsRaw.length - 1];
  const x0 = xsRaw[0], span = xEnd - x0;
  const X = v => span === 0 ? (Lp + W - R) / 2 : Lp + (v - x0) * (W - Lp - R) / span;
  const Y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const fy = v => unit === '%' ? `${fmtNum(round1(v))}%` : fmtNum(round1(v));
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step)
    g += `<line x1="${Lp}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid${Math.abs(v) < 1e-9 && zero ? ' zero' : ''}"/><text x="${Lp - 6}" y="${Y(v) + 4}" class="axis" text-anchor="end">${fy(v)}</text>`;
  const line = points.map((p, i) => `${X(xsRaw[i])},${Y(p.y)}`).join(' ');
  // Beschriftungen nur, wenn genug Abstand zur vorherigen (und zum Prognose-Endpunkt) bleibt
  const xs = xsRaw.map(X), endX = forecast ? X(xEnd) : Infinity;
  const pick = minGap => {
    const keep = new Set([xs.length - 1]); let lastX = xs[xs.length - 1];
    for (let i = xs.length - 2; i >= 0; i--) if (lastX - xs[i] >= minGap) { keep.add(i); lastX = xs[i]; }
    return keep;
  };
  const dateIdx = pick(44), valIdx = pick(34);
  const tipOf = (d, y) => `${fmtDate(d, 'tiny')}: ${fy(y)}${unit === 'kg' ? ' kg' : unit === '%' ? '' : ' Wdh.'}`;
  const hits = points.map((p, i) => `<circle cx="${xs[i]}" cy="${Y(p.y)}" r="15" class="hit" data-tip="${esc(tipOf(p.d, p.y))}"/>`).join('');
  const dots = points.map((p, i) => `<circle cx="${xs[i]}" cy="${Y(p.y)}" r="4.5" class="dot"/>
    ${valIdx.has(i) ? `<text x="${xs[i]}" y="${Y(p.y) - 9}" class="val" text-anchor="middle">${fy(p.y)}</text>` : ''}
    ${dateIdx.has(i) && endX - xs[i] >= 44 || (!forecast && dateIdx.has(i)) ? `<text x="${xs[i]}" y="${H - 8}" class="axis" text-anchor="middle">${fmtDate(p.d, 'tiny')}</text>` : ''}`).join('');
  let fc = '';
  if (forecast) {
    const lx = X(xsRaw[xsRaw.length - 1]), ly = Y(points[points.length - 1].y);
    const cpts = curve && curve.length ? [`${lx},${ly}`].concat(curve.map(c => `${X(dayNum(c.d))},${Y(c.y)}`)).join(' ') : `${lx},${ly} ${X(xEnd)},${Y(forecast.y)}`;
    fc = `<polyline points="${cpts}" class="fline"/>
      <circle cx="${X(xEnd)}" cy="${Y(forecast.y)}" r="15" class="hit" data-tip="${esc('Prognose ' + tipOf(forecast.d, forecast.y))}"/>
      <circle cx="${X(xEnd)}" cy="${Y(forecast.y)}" r="4.5" class="fdot"/>
      <text x="${X(xEnd)}" y="${Y(forecast.y) - 9}" class="val" text-anchor="end">${fy(forecast.y)}</text>
      <text x="${X(xEnd)}" y="${H - 8}" class="axis" text-anchor="end">${fmtDate(forecast.d, 'tiny')}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlaufsgrafik">${g}<polyline points="${line}" class="pline"/>${fc}${dots}${hits}</svg>
    <div class="chart-tip" aria-live="polite">Punkt antippen für Details</div>`;
}

/* ---------------- Pausen-Timer ----------------
   Startet, sobald ein Satz vollständig eingetragen ist (im Supersatz erst nach der ganzen Runde).
   Der Endzeitpunkt wird im Training gespeichert, damit der Timer auch nach dem Schließen der App weiterläuft. */
const fmtRest = sec => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min` : `${sec} s`;
const Rest = (() => {
  const el = document.getElementById('rest');
  let tick = null, wake = null, audio = null, doneShown = false;
  // Timer gehört zum laufenden Training oder zum laufenden Maximalkrafttest
  const sess = () => { const s = currentSession() || currentTest(); return s && s.status === 'active' ? s : null; };
  const left = r => Math.ceil((r.endAt - Date.now()) / 1000);
  const mmss = sec => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
  // Ton: Web Audio muss auf dem iPhone einmal durch eine Berührung freigeschaltet werden
  document.addEventListener('pointerdown', () => {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* kein Ton */ }
  }, { passive: true });
  function beep() {
    if (!audio || db.settings?.sound === false) return;
    try {
      [0, 0.25, 0.5].forEach((t, k) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = k === 2 ? 1320 : 880; o.connect(g); g.connect(audio.destination);
        const at = audio.currentTime + t;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.4, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        o.start(at); o.stop(at + 0.2);
      });
    } catch (e) { /* kein Ton */ }
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* iPhone: keine Vibration */ }
  }
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }
  function nextLabel(fromEl) {
    const all = [...$app.querySelectorAll('input[data-f="r"]')];
    const start = fromEl ? all.indexOf(fromEl) + 1 : 0;
    const nxt = all.slice(Math.max(0, start)).find(x => x.value === '');
    if (!nxt) return 'Training abschließen';
    const ex = currentSession().exercises[+nxt.dataset.ex];
    return `${ex.name} · Satz ${+nxt.dataset.set + 1}`;
  }
  function start(sec, label) {
    const s = sess(); if (!s || !sec) return;
    s.rest = { endAt: Date.now() + sec * 1000, total: sec, next: label };
    save(); doneShown = false; keepAwake(true); sync();
  }
  function stop() {
    const s = currentSession() || currentTest(); if (s && s.rest) { delete s.rest; save(); }
    hide(); keepAwake(false);
  }
  function hide() { el.hidden = true; document.body.classList.remove('has-rest'); document.documentElement.classList.remove('has-rest'); clearInterval(tick); tick = null; }
  function draw() {
    const s = sess(); if (!s || !s.rest) return hide();
    const r = s.rest, sec = left(r);
    if (sec <= -8) return stop(); // „Weiter geht's“ nach ein paar Sekunden ausblenden
    el.querySelector('.rest-time').textContent = sec > 0 ? mmss(sec) : 'Los!';
    el.querySelector('.rest-label').textContent = sec > 0 ? 'Pause' : 'Weiter geht\'s!';
    el.querySelector('.rest-next').textContent = r.next ? `Als Nächstes: ${r.next}` : '';
    el.querySelector('.rest-fill').style.width = `${Math.max(0, Math.min(100, 100 - (sec / r.total) * 100))}%`;
    el.classList.toggle('done', sec <= 0);
    el.querySelector('[data-rest="sound"]').innerHTML = icon(db.settings?.sound === false ? 'mute' : 'sound');
    if (sec <= 0 && !doneShown) { doneShown = true; beep(); }
  }
  function sync() {
    const s = sess();
    if (!s || !s.rest || left(s.rest) <= -8) { if (s && s.rest) { delete s.rest; save(); } return hide(); }
    if (left(s.rest) <= 0) doneShown = true; // abgelaufen, während die App zu war: nicht nachträglich piepen
    el.hidden = false; document.body.classList.add('has-rest'); document.documentElement.classList.add('has-rest');
    draw();
    if (!tick) tick = setInterval(draw, 250);
  }
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rest]'); if (!b) return;
    const s = sess(); if (!s || !s.rest) return;
    const a = b.dataset.rest;
    if (a === 'stop') return stop();
    if (a === 'sound') { db.settings = Object.assign({}, db.settings, { sound: db.settings?.sound === false }); save(); draw(); toast(db.settings.sound ? 'Ton an' : 'Ton aus'); return; }
    const d = +a;
    s.rest.endAt = Math.max(Date.now() + 1000, s.rest.endAt + d * 1000);
    s.rest.total = Math.max(1, s.rest.total + d);
    doneShown = left(s.rest) <= 0; save(); draw();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); if (!el.hidden) keepAwake(true); } });
  return {
    sync, stop, start,
    afterSet(s, i, j, inputElement) {
      if (s.status !== 'active') return;
      const sec = L.restAfter(s, i, j);
      if (sec) start(sec, nextLabel(inputElement));
    },
  };
})();

/* ---------------- Router ---------------- */
const routes = [
  [/^#?\/?$/, viewHome],
  [/^#\/plaene$/, viewPlans],
  [/^#\/plan\/([^/]+)$/, viewPlanEdit],
  [/^#\/plan\/([^/]+)\/uebung\/([^/]+)$/, viewSlotEdit],
  [/^#\/training$/, viewTrainingEntry],
  [/^#\/training\/([^/]+)$/, viewWorkout],
  [/^#\/ergebnis\/([^/]+)$/, viewResult],
  [/^#\/trainings$/, viewTrainings],
  [/^#\/fortschritt$/, viewProgress],
  [/^#\/fortschritt\/uebung\/([^/]+)$/, key => viewExercise(key, false)],
  [/^#\/ausblick$/, viewOutlook],
  [/^#\/coach$/, viewCoach],
  [/^#\/maxkraft$/, viewMax],
  [/^#\/maxkraft\/test\/([^/]+)$/, viewMaxTest],
  [/^#\/ausblick\/uebung\/([^/]+)$/, key => viewExercise(key, true)],
];
let lastHash = location.hash;
function cleanupEmptySessions(keepId) {
  const before = db.sessions.length, tb = (db.maxTests || []).length;
  const mt = location.hash.match(/^#\/maxkraft\/test\/([^/]+)$/);
  db.maxTests = (db.maxTests || []).filter(t => t.status !== 'active' || (mt && mt[1] === t.id) || t.exercises.some(e => e.attempts.length || e.warmDone.length || e.skipped));
  if (db.maxTests.length !== tb) save();
  db.sessions = db.sessions.filter(s => s.id === keepId || !untouched(s));
  if (db.sessions.length !== before) save();
}
function render() {
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { $app.innerHTML = fn(...m.slice(1).map(x => x && decodeURIComponent(x))); Rest.sync(); return; }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', () => {
  // Leeres, nur geöffnetes Training beim Verlassen wieder entfernen
  const m = location.hash.match(/^#\/training\/([^/]+)$/);
  cleanupEmptySessions(m ? m[1] : null);
  lastHash = location.hash;
  render(); window.scrollTo(0, 0);
});

/* ---------------- Startseite ---------------- */
function viewHome() {
  const plan = activePlan(), run = activeSession();
  return `<div class="home">
    <header class="brand" aria-label="Gym Notes">${DACKEL}<span class="wordmark">GYM <b>NOTES</b></span></header>
    <p class="active-plan">Aktiver Plan: <b>${plan ? esc(plan.name) : 'keiner'}</b></p>
    ${weekLine()}
    <div class="tiles">
      <a class="tile" href="#/plaene"><span class="ic">${icon('plans')}</span><span class="tl">Trainingspläne</span></a>
      <a class="tile tile-main" href="#/training"><span class="ic">${icon('dumbbell')}</span><span class="tl">Training</span>${run ? '<span class="hint">Weitermachen</span>' : ''}</a>
      <a class="tile" href="#/fortschritt"><span class="ic">${icon('progress')}</span><span class="tl">Fortschritt</span></a>
      <a class="tile" href="#/ausblick"><span class="ic">${icon('outlook')}</span><span class="tl">Ausblick</span></a>
      ${coachTile(plan)}
      ${maxTile()}
    </div></div>`;
}

function weekLine() {
  const goal = db.settings?.weeklyGoal || 3, n = L.weekCount();
  const dots = Array.from({ length: Math.max(goal, n) }, (_, k) => `<span class="wdot ${k < n ? 'on' : ''}"></span>`).join('');
  return `<p class="week" aria-label="Diese Woche ${n} von ${goal} Trainings">Diese Woche <span class="wdots">${dots}</span> <b>${n} von ${goal}</b>${n >= goal ? ' · Ziel erreicht 🎉' : ''}</p>`;
}

/* ---------------- Training ---------------- */
function viewTrainingEntry() {
  let s = activeSession();
  if (!s) {
    const plan = activePlan();
    if (!plan) { setTimeout(() => location.replace('#/plaene'), 0); return ''; }
    s = L.prefillWeights(L.newSession(plan, todayISO())); // kg vom letzten Mal vorausfüllen
    db.sessions.push(s); save();
  }
  setTimeout(() => location.replace(`#/training/${s.id}`), 0);
  return '';
}
function lastLine(s, ex) {
  const prev = previousEntry(ex.key, s);
  if (prev) return `<p class="last">Letztes Mal${prev.ex.name !== ex.name ? ` als ${esc(prev.ex.name)}` : ''} (${prev.session.kind === 'baseline' ? 'Startwerte, ' : ''}${fmtDate(prev.session.date, 'tiny')}): <b>${fmtSets(prev.sets)}</b></p>`;
  if (ex.guide != null) return `<p class="last">Noch kein Eintrag · Orientierung <b>${fmtNum(ex.guide)} kg</b></p>`;
  return '<p class="last">Noch kein Eintrag</p>';
}
/* ---- Gefühl je Übung ---- */
const FEEL_UI = { good: ['faceGood', 'gut', 'da war noch Luft'], ok: ['faceOk', 'okay', 'passend anstrengend'], bad: ['faceBad', 'schlecht', 'zu schwer, unsauber oder gezwickt'] };
const feelChip = v => v ? `<span class="feel-chip f-${v}">${icon(FEEL_UI[v][0])}${FEEL_UI[v][1]}</span>` : '';
/** Bewertung erscheint, sobald der letzte Arbeitssatz der Übung eingetragen ist. */
function feelReady(ex) {
  if (ex.skipped) return false;
  const work = ex.sets.filter(x => !x.warm);
  return work.length > 0 && isValidSet(work[work.length - 1]);
}
function feelButtons(ex, i) {
  return `<div class="feel-btns" role="group" aria-label="Wie lief ${esc(ex.name)}?">${L.FEELS.map(v => `<button class="feel-btn f-${v} ${ex.feel === v ? 'on' : ''}" data-act="feel" data-ex="${i}" data-v="${v}" aria-pressed="${ex.feel === v}" aria-label="${FEEL_UI[v][1]}: ${FEEL_UI[v][2]}">${icon(FEEL_UI[v][0])}<small>${FEEL_UI[v][1]}</small></button>`).join('')}</div>`;
}
function feelSlotHTML(s, i) {
  const ex = s.exercises[i];
  if (!ex.group) return feelReady(ex) ? `<div class="feel"><span class="feel-q">Wie lief's?</span>${feelButtons(ex, i)}</div>` : '';
  const rows = s.exercises.map((e, k) => [e, k]).filter(([e]) => e.group === ex.group && feelReady(e));
  return rows.length ? `<div class="feel ss-feel"><span class="feel-q">Wie liefen die Übungen?</span>${rows.map(([e, k]) => `<div class="feel-ss-row"><b>${esc(e.name)}</b>${feelButtons(e, k)}</div>`).join('')}</div>` : '';
}
const feelSlot = (s, i) => `<div class="feel-slot" data-feel-slot="${s.exercises[i].group ? 'g' + s.exercises[i].group : i}">${feelSlotHTML(s, i)}</div>`;
function refreshFeel(s, i) {
  const ex = s.exercises[i], el = $app.querySelector(`[data-feel-slot="${ex.group ? 'g' + ex.group : i}"]`);
  if (el) el.innerHTML = feelSlotHTML(s, i);
}

let editingNote = null;
function noteBlock(key) {
  const n = L.noteFor(key);
  if (editingNote === key) return `<input class="note-input" data-note="${esc(key)}" value="${esc(n)}" placeholder="z. B. Sitzhöhe 4, Griff eng" aria-label="Notiz">`;
  return n ? `<button class="note-line" data-act="note" data-key="${esc(key)}">${icon('note')}${esc(n)}</button>` : '';
}
const noteBtn = key => `<button class="icon-btn" data-act="note" data-key="${esc(key)}" aria-label="Notiz bearbeiten">${icon('note')}</button>`;
function inputs(i, j, set) {
  return `<input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" data-f="w" data-ex="${i}" data-set="${j}" value="${fmtNum(set.w)}" placeholder="kg" aria-label="Satz ${j + 1} Gewicht in kg">
    <span class="x">×</span>
    <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" data-f="r" data-ex="${i}" data-set="${j}" value="${set.r ?? ''}" placeholder="Wdh." aria-label="Satz ${j + 1} Wiederholungen">`;
}
function prevCellFor(i, j, p) {
  return p && isValidSet(p)
    ? `<button class="prev-btn" data-act="take" data-ex="${i}" data-set="${j}" data-w="${p.w}" data-r="${p.r}" aria-label="Wert vom letzten Mal übernehmen">${fmtNum(p.w)} × ${p.r}<small>zuletzt</small></button>`
    : '<span class="prev-empty">–</span>';
}
function singleCard(s, ex, i) {
  const head = `<div class="ex-head"><h3>${esc(ex.name)}</h3>${ex.perDumbbell ? '<span class="pd">pro Hantel</span>' : ''}<span class="rest-tag">${icon('timer')}${fmtRest(L.restOf(ex))}</span>${noteBtn(ex.key)}</div>${noteBlock(ex.key)}`;
  if (ex.skipped) return `<section class="ex-card skipped">${head}<p class="last">Übersprungen – zählt nicht als schwächer.</p>
    <div class="ex-actions"><button data-act="unskip" data-ex="${i}">Doch trainieren</button></div></section>`;
  const prev = previousEntry(ex.key, s), prevSets = prev ? prev.ex.sets.filter(L.isWorkSet) : [];
  let w = 0;
  const rows = ex.sets.map((set, j) => {
    if (set.warm) return `<div class="set-row single warm ${isValidSet(set) ? 'complete' : ''}"><button class="no warm-no" data-act="del-warm" data-ex="${i}" data-set="${j}" aria-label="Aufwärmsatz entfernen">A</button>${inputs(i, j, set)}<span class="prev-empty small">Aufwärmen</span></div>`;
    const p = prevSets[w++];
    return `<div class="set-row single ${isValidSet(set) ? 'complete' : ''}"><span class="no">${w}</span>${inputs(i, j, set)}${prevCellFor(i, j, p)}</div>`;
  }).join('');
  return `<section class="ex-card" data-card="${i}">${head}${lastLine(s, ex)}
    <div class="sets"><div class="set-head single"><span></span><span>kg${ex.perDumbbell ? ' / Hantel' : ''}</span><span></span><span>Wdh.</span><span>Zuletzt</span></div>${rows}</div>
    <button class="add-warm" data-act="add-warm" data-ex="${i}">${icon('plus')}Aufwärmsatz</button>
    ${feelSlot(s, i)}
    <div class="ex-actions"><button class="btn-take" data-act="take-all" data-ex="${i}" ${prev ? '' : 'disabled'}>Wie letztes Mal</button>
    <button data-act="skip" data-ex="${i}">Überspringen</button></div></section>`;
}
function supersetCard(s, b) {
  const items = b.items;
  const rounds = Math.max(...items.map(it => it.ex.sets.length));
  const prevs = items.map(it => previousEntry(it.ex.key, s));
  let h = `<section class="ex-card superset"><div class="ss-head"><h3>Supersatz ${esc(b.group)}</h3><span class="muted small">${rounds} Runden · ohne Pause dazwischen</span><span class="rest-tag">${icon('timer')}${fmtRest(Math.max(...items.map(it => L.restOf(it.ex))))} nach jeder Runde</span></div>
    <ol class="ss-list">${items.map((it, k) => `<li class="${it.ex.skipped ? 'skipped' : ''}"><div class="ss-li-top"><b>${esc(it.ex.name)}</b>${it.ex.perDumbbell ? '<span class="pd">pro Hantel</span>' : ''}${noteBtn(it.ex.key)}
      ${it.ex.skipped ? `<button class="btn-small" data-act="unskip" data-ex="${it.idx}">Doch trainieren</button>` : `<button class="btn-small" data-act="skip" data-ex="${it.idx}">Überspringen</button>`}</div>
      ${noteBlock(it.ex.key)}${it.ex.skipped ? '<p class="last">Übersprungen – zählt nicht als schwächer.</p>' : lastLine(s, it.ex)}</li>`).join('')}</ol>`;
  for (let r = 0; r < rounds; r++) {
    h += `<div class="round"><div class="round-title">Runde ${r + 1}</div>`;
    items.forEach((it, k) => {
      const ex = it.ex, set = ex.sets[r];
      if (ex.skipped || !set) return;
      const p = prevs[k] && prevs[k].ex.sets[r];
      const prevCell = prevCellFor(it.idx, r, p);
      h += `<div class="ss-row"><div class="ss-name">${esc(ex.name)}</div>
        <div class="set-row ss ${isValidSet(set) ? 'complete' : ''}">${inputs(it.idx, r, set)}${prevCell}</div></div>`;
    });
    h += '</div>';
  }
  const anyPrev = prevs.some(Boolean);
  h += feelSlot(s, items[0].idx);
  return h + `<div class="ex-actions"><button class="btn-take" data-act="take-group" data-group="${esc(b.group)}" ${anyPrev ? '' : 'disabled'}>Wie letztes Mal</button></div></section>`;
}
function viewWorkout(id) {
  const s = getSession(id);
  if (!s) return topbar('Training') + '<p class="empty">Training nicht gefunden.</p>';
  const done = s.exercises.filter(e => e.skipped || validSets(e).length).length;
  let h = topbar(s.kind === 'baseline' ? 'Startwerte' : s.status === 'done' ? 'Training korrigieren' : 'Training',
    s.status === 'done' ? `#/ergebnis/${s.id}` : '#/', s.status === 'done');
  h += `<div class="wk-info"><div class="row"><div class="spacer"><b>${esc(s.planName)}</b>
    <div class="muted small">${done} von ${s.exercises.length} Übungen erledigt</div></div>
    <label class="date-lbl"><span class="muted small">Datum</span><input type="date" data-act="date" value="${s.date}" max="${todayISO()}" aria-label="Datum"></label></div>
    <div class="progress"><div style="width:${Math.round(done / Math.max(1, s.exercises.length) * 100)}%"></div></div>
    ${s.status === 'active' ? `<div class="wk-stats" id="wk-stats">${liveStats(s)}</div>` : ''}</div>`;
  for (const b of blocks(s.exercises)) h += b.group ? supersetCard(s, b) : singleCard(s, b.items[0].ex, b.items[0].idx);
  h += '<div class="wk-footer stack">';
  if (s.status === 'active') h += `<button class="btn-primary btn-block btn-big" data-act="finish">Training abschließen</button>
      <button class="btn-danger btn-block" data-act="discard">Training verwerfen</button>`;
  else h += `<button class="btn-primary btn-block btn-big" data-act="show-result">Fertig – Auswertung ansehen</button>
      <button class="btn-danger btn-block" data-act="delete-session">Training löschen</button>`;
  return h + '</div>';
}

const fmtDur = min => min == null ? '–' : min >= 60 ? `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')} h` : `${Math.floor(min)}:${String(Math.floor((min * 60) % 60)).padStart(2, '0')}`;
const fmtVol = v => `${v.toLocaleString('de-DE')} kg`;
function liveStats(s) {
  const st = L.sessionStats(s);
  return `<span>${icon('timer')}<b>${s.startedAt ? fmtDur(st.minutes) : 'startet mit dem 1. Satz'}</b></span><span><b>${st.sets}</b> ${st.sets === 1 ? 'Satz' : 'Sätze'}</span><span><b>${fmtVol(st.volume)}</b> bewegt</span>`;
}
// Live-Werte im laufenden Training jede Sekunde aktualisieren
setInterval(() => { const el = document.getElementById('wk-stats'), s = currentSession(); if (el && s && s.status === 'active') el.innerHTML = liveStats(s); }, 1000);

/* ---------------- Auswertung eines Trainings ---------------- */
function counts(list) {
  const c = st => list.filter(x => x === st).length;
  return `<div class="counts"><div class="s-up"><b>${icon('stUp')}${c('up')}</b>stärker</div><div class="s-same"><b>${icon('stSame')}${c('same')}</b>gleich</div>
    <div class="s-down"><b>${icon('stDown')}${c('down')}</b>schwächer</div><div class="s-grey"><b>${icon('stNone')}${c('none') + c('skipped')}</b>ohne Vgl.</div></div>`;
}
function metaFor(a) {
  const parts = [];
  if (a.prev) parts.push(`Heute ${fmtSets(a.cur)} · Zuletzt ${a.prev.session.kind === 'baseline' ? 'Startwerte ' : ''}${fmtDate(a.prev.session.date, 'tiny')}: ${fmtSets(a.prev.sets)}`);
  if (a.trend) parts.push(`Trend: ${a.trend.text}`);
  return parts.map(esc).join('<br>');
}
function viewResult(id) {
  const s = getSession(id);
  if (!s) return topbar('Auswertung') + '<p class="empty">Training nicht gefunden.</p>';
  const res = s.exercises.map(ex => analyzeExercise(s, ex));
  const prs = s.exercises.map(ex => L.recordsFor(s, ex));
  const prCount = prs.reduce((a, r) => a + (r.length ? 1 : 0), 0);
  const st = L.sessionStats(s);
  let h = topbar(s.kind === 'baseline' ? 'Startwerte' : 'Auswertung', '#/') +
    `<p class="muted">${fmtDate(s.date, 'long')} · ${sessionLabel(s)}</p>`;
  if (s.kind !== 'baseline') h += `<div class="summary"><div><b>${fmtDur(st.minutes)}</b><span>Dauer</span></div><div><b>${st.sets}</b><span>${st.sets === 1 ? 'Satz' : 'Sätze'}</span></div>
    <div><b>${st.volume.toLocaleString('de-DE')}</b><span>kg bewegt</span></div><div class="${prCount ? 'has-pr' : ''}"><b>${icon('trophy')}${prCount}</b><span>Rekorde</span></div></div>`;
  if (prCount) {
    const items = s.exercises.map((ex, i) => prs[i].length ? `<div class="pr-item"><b>${esc(ex.name)}</b><span>${prs[i].map(r => esc(r.text)).join(' · ')}</span></div>` : '').filter(Boolean);
    h += `<div class="pr-box"><div class="pr-head">${icon('trophy')}${prCount === 1 ? 'Neuer Rekord' : `${prCount} neue Rekorde`}</div>${items.slice(0, 4).join('')}
      ${items.length > 4 ? `<details class="pr-more"><summary>${items.length - 4} weitere Rekorde anzeigen</summary>${items.slice(4).join('')}</details>` : ''}</div>`;
  }
  if (s.status === 'done' && s.kind !== 'baseline') h += checkinCard(s);
  const df = L.dayFeel(s);
  if (df.tough) h += `<div class="card day-tough">${icon('faceBad')}<span><b>Heute insgesamt schwer?</b><small>${df.bad} von ${df.rated} Übungen mit „schlecht“ bewertet. Das liegt oft an Schlaf, Stress oder Essen – nicht an den Übungen. Gönn dir Erholung.</small></span></div>`;
  h += counts(res.map(a => a.status));
  if (s.status === 'active') h += `<p class="card small">Dieses Training läuft noch. <a href="#/training/${s.id}">Weiter eintragen</a></p>`;
  h += groupedList(s.exercises, (ex, i) => statusRow({ st: res[i].status, name: ex.name, text: res[i].text, meta: metaFor(res[i]),
    href: `#/fortschritt/uebung/${encodeURIComponent(ex.key)}`, perDumbbell: ex.perDumbbell, prs: prs[i], feel: ex.feel }));
  h += `<div class="stack" style="margin-top:16px"><a class="btn btn-ghost btn-block" href="#/training/${s.id}">Training korrigieren</a>
    <a class="btn btn-primary btn-block btn-big" href="#/">Fertig</a></div>`;
  return h;
}
function viewTrainings() {
  let h = topbar('Alle Trainings', '#/fortschritt', true);
  const list = [...db.sessions].sort(sessionOrder).reverse();
  if (!list.length) return h + '<p class="empty">Noch keine Trainings.</p>';
  for (const s of list) {
    h += `<a class="card link" href="#/${s.status === 'done' ? 'ergebnis' : 'training'}/${s.id}"><div class="row"><b class="spacer">${fmtDate(s.date, 'long')}</b>
      ${s.status === 'active' ? '<span class="tag green">läuft</span>' : ''}${s.kind === 'baseline' ? '<span class="tag">Startwerte</span>' : ''}<span class="muted">›</span></div>
      <p class="muted small">${esc(s.planName)}${s.unitName ? ' · ' + esc(s.unitName) : ''} · ${s.exercises.filter(e => validSets(e).length).length} Übungen</p></a>`;
  }
  return h;
}

/* ---- Coach-Check-in nach dem Training ---- */
let editingCheckin = null;
const CTX_UI = {
  sleep: { good: 'gut', ok: 'mittel', bad: 'schlecht' },
  time: { morning: 'morgens', noon: 'mittags', evening: 'abends' },
  ate: { yes: 'ja', no: 'nein' },
};
function ctxRow(k, label, val) {
  return `<div class="ci-ctx-row"><span>${label}</span><div class="ci-seg small">${Object.entries(CTX_UI[k]).map(([v, l]) => `<button class="${val === v ? 'on' : ''} ${k === 'sleep' ? 'f-' + v : ''}" data-act="ci-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function resultSession() { const m = location.hash.match(/^#\/ergebnis\/([^/]+)$/); return m && getSession(m[1]); }
function checkinCard(s) {
  const ci = s.checkin || {};
  if ((ci.done || ci.skipped) && editingCheckin !== s.id) {
    if (ci.skipped) return `<div class="card ci-mini"><span class="muted">Check-in übersprungen</span><button class="btn-small btn-ghost" data-act="ci-edit">Nachholen</button></div>`;
    const ctx = [ci.sleep && `Schlaf ${CTX_UI.sleep[ci.sleep]}`, ci.time && CTX_UI.time[ci.time], ci.ate != null && (ci.ate ? 'gegessen' : 'nüchtern')].filter(Boolean).join(' · ');
    return `<div class="card ci-mini"><span class="ci-sum"><span class="ci-l1">${icon('coach')}<b>Check-in:</b> ${feelChip(ci.feel) || '–'}</span>${(ci.pump || []).length ? `<span class="ci-l2">Pump: ${ci.pump.map(L.muscleName).map(esc).join(', ')}</span>` : ''}${(ci.pain || []).length ? `<span class="ci-l2 ci-pain">Gezwickt: ${ci.pain.map(L.painName).map(esc).join(', ')}</span>` : ''}${ctx ? `<span class="ci-l2">${esc(ctx)}</span>` : ''}</span><button class="btn-small btn-ghost" data-act="ci-edit">Ändern</button></div>`;
  }
  const trained = L.musclesInSession(s), sel = ci.pump || [];
  const chips = L.MUSCLES.filter(([id]) => trained.includes(id) || sel.includes(id))
    .map(([id, n]) => `<button class="chip ${sel.includes(id) ? 'on' : ''}" data-act="ci-pump" data-m="${id}">${sel.includes(id) ? icon('check') : ''}${esc(n)}</button>`).join('');
  return `<div class="card checkin"><div class="ci-head">${icon('coach')}<span><b>Coach-Check-in</b><small>Zwei kurze Fragen – damit ich dich besser einschätzen kann.</small></span></div>
    <div class="ci-q">Wie lief das Training insgesamt?</div>
    <div class="feel-btns">${L.FEELS.map(v => `<button class="feel-btn f-${v} ${ci.feel === v ? 'on' : ''}" data-act="ci-feel" data-v="${v}" aria-pressed="${ci.feel === v}">${icon(FEEL_UI[v][0])}<small>${FEEL_UI[v][1]}</small></button>`).join('')}</div>
    <div class="ci-q">Wo hast du den meisten Pump gespürt?</div><p class="muted small" style="margin-top:-4px">Tippe auf die Muskeln – mehrere möglich. Hell umrandet: heute trainiert.</p>
    <div class="bm-figs">${['front', 'back'].map(side => `<figure>${bodyPickSVG(side, trained, sel)}<figcaption>${side === 'front' ? 'vorne' : 'hinten'}</figcaption></figure>`).join('')}</div>
    <div class="chips ci-chips">${chips}</div>
    <div class="ci-q">Hat etwas gezwickt?</div>
    <div class="ci-seg">${[['no', 'Nein'], ['yes', 'Ja']].map(([v, l]) => `<button class="${(v === 'yes') === !!ci.painOn ? 'on' : ''} ${v === 'yes' ? 'warn' : ''}" data-act="ci-painon" data-v="${v}">${l}</button>`).join('')}</div>
    ${ci.painOn ? `<p class="muted small">Wo? Mehrere möglich.</p><div class="chips ci-pain-chips">${L.PAIN_AREAS.map(([id, n]) => `<button class="chip ${(ci.pain || []).includes(id) ? 'on' : ''}" data-act="ci-pain" data-a="${id}">${esc(n)}</button>`).join('')}</div>` : ''}
    <div class="ci-q">Rahmenbedingungen</div>
    <div class="ci-ctx">${ctxRow('sleep', 'Schlaf letzte Nacht', ci.sleep)}${ctxRow('time', 'Uhrzeit', ci.time || L.timeOfDay(s.startedAt || s.createdAt))}${ctxRow('ate', 'Vorher gegessen', ci.ate == null ? null : ci.ate ? 'yes' : 'no')}</div>
    <div class="ci-actions"><button class="btn-primary" data-act="ci-done" ${ci.feel || sel.length || ci.sleep || ci.ate != null || (ci.pain || []).length ? '' : 'disabled'}>Fertig</button><button class="btn-ghost" data-act="ci-skip">Überspringen</button></div></div>`;
}

/* ---------------- Fortschritt ---------------- */
function otherExercises(plan) {
  const inPlan = new Set(plan.exercises.map(e => L.canon(normKey(e.name))));
  const map = new Map();
  for (const s of doneSessions()) for (const ex of s.exercises)
    if (!inPlan.has(L.canon(ex.key)) && validSets(ex).length) map.set(L.canon(ex.key), ex.name);
  return [...map.entries()];
}
function viewProgress() {
  const plan = activePlan();
  let h = topbar('Fortschritt');
  if (!plan) return h + '<p class="empty">Kein aktiver Plan.</p>';
  const prog = planProgress(plan);
  const last = prog.points[prog.points.length - 1];
  h += `<p class="muted small">Plan: <b>${esc(plan.name)}</b></p>
    <div class="chart-wrap"><div class="chart-title"><span>Kraft gegenüber Startwerten</span>${last ? `<b class="${last.y > 0.05 ? 'c-up' : last.y < -0.05 ? 'c-down' : ''}">${fmtPct(last.y)}</b>` : ''}</div>
    ${lineChart({ points: prog.points, unit: '%', zero: true })}
    <p class="chart-note">Durchschnitt aller Übungen, geschätztes Maximalgewicht (1RM) des besten Satzes.</p></div>`;
  h += '<p class="muted small list-hint">Letztes Training gegenüber dem vorherigen · antippen für Details</p>';
  h += groupedList(plan.exercises, ex => {
    const key = normKey(ex.name), a = latestProgress(key);
    const spark = sparkline(exerciseHistory(key).slice(-8).map(e => bestE1(e.sets)));
    return compactRow({ st: a.status, name: ex.name, delta: L.shortDelta(a), spark, href: `#/fortschritt/uebung/${encodeURIComponent(key)}` });
  });
  const others = otherExercises(plan);
  if (others.length) h += `<h2>Weitere Übungen (nicht im Plan)</h2>${others.map(([k, n]) => `<a class="card link row" href="#/fortschritt/uebung/${encodeURIComponent(k)}"><span class="spacer">${esc(n)}</span><span class="muted">›</span></a>`).join('')}`;
  h += '<a class="btn btn-ghost btn-block" style="margin-top:14px" href="#/trainings">Alle Trainings ansehen, korrigieren oder löschen</a>';
  return h;
}

/* ---------------- Ausblick ---------------- */
let outlookDays = 182;
try { outlookDays = +localStorage.getItem('trainingsapp.ausblick') || 182; } catch (e) { /* egal */ }
const PERIODS = [[30, '1 Monat'], [91, '3 Monate'], [182, '6 Monate']];
function periodSeg() {
  return `<div class="seg seg3">${PERIODS.map(([d, l]) => `<button class="${d === outlookDays ? 'on' : ''}" data-act="period" data-d="${d}">${l}</button>`).join('')}</div>`;
}
const outlookNote = '<p class="note">Grobe Schätzung: Die App rechnet mit höchstens +1 % pro Woche und lässt das Tempo mit der Zeit abflachen – so wie Fortschritt meist verläuft.</p>';
/** Stützstellen für die Prognosekurve (ca. alle 2 Wochen bis zum Ende des Zeitraums). */
const curveDays = days => { const n = Math.max(2, Math.round(days / 14)); return Array.from({ length: n }, (_, k) => Math.round(days * (k + 1) / n)); };
function viewOutlook() {
  const plan = activePlan();
  let h = topbar('Ausblick');
  if (!plan) return h + '<p class="empty">Kein aktiver Plan.</p>';
  const pf = planForecast(plan, outlookDays);
  const pts = pf.prog.points;
  const lastD = pts.length ? pts[pts.length - 1].d : todayISO();
  h += `<p class="muted small">Plan: <b>${esc(plan.name)}</b></p>${periodSeg()}${outlookNote}
    <div class="chart-wrap"><div class="chart-title"><span>Gesamtprognose</span><b class="${pf.pct > 0.05 ? 'c-up' : ''}">${pf.pct == null ? '–' : fmtPct(pf.pct)}</b></div>
    <p class="chart-note" style="margin-top:0">${pf.pct == null ? 'Für eine Prognose brauche ich mindestens 3 Trainings.' : `Durchschnitt aus ${pf.count} Übungen in ${PERIODS.find(p => p[0] === outlookDays)[1]} gegenüber heute.`}</p>
    ${lineChart({ points: pts, curve: pf.pct == null || pf.endY == null ? null : curveDays(outlookDays).map(t => ({ d: addDaysISO(lastD, t), y: pf.at(t) })), unit: '%', timeScale: true, zero: true })}
    <p class="chart-note">Kraft gegenüber Startwerten · durchgezogen: bisher · gestrichelt: Prognose</p></div>`;
  h += groupedList(plan.exercises, ex => {
    const x = pf.per.find(p => p.e === ex), f = x.f;
    const st = f.status === 'few' ? 'ffew' : f.status === 'flat' ? 'fflat' : 'fup';
    let meta = '';
    if (f.status !== 'few') meta = esc(`Trend ${fmtPct(f.weeklyPct)} pro Woche${f.capped ? ` – gedeckelt auf ${fmtPct(L.MAX_WEEKLY * 100)}, abflachend` : ''} · Basis: ${f.n} Trainings`);
    const text = f.status === 'few' ? f.text : forecastText(ex.name, f, outlookDays).replace(`${ex.name}: `, '');
    return statusRow({ st, name: ex.name, text, meta, href: `#/ausblick/uebung/${encodeURIComponent(x.key)}`, perDumbbell: ex.perDumbbell });
  });
  return h;
}

/* ---------------- Coach ---------------- */
function coachTile(plan) {
  const r = plan ? L.coachReport(plan) : null;
  const n = r ? r.counts.issues + L.painReport(plan).filter(p => p.n4).length : 0;
  const sub = !r ? 'Kein Plan' : n ? `${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}` : r.counts.few === r.exercises.length ? 'ab 4 Trainings' : 'alles im Plan';
  return `<a class="tile tile-small" href="#/coach"><span class="ic">${icon('coach')}</span><span class="tc"><span class="tl">Coach</span><span class="tsub ${n ? 'warn' : ''}">${sub}</span></span>${n ? `<span class="hint">${n}</span>` : ''}</a>`;
}
function maxTile() {
  const run = (db.maxTests || []).find(t => t.status === 'active'), due = L.maxTestDue();
  const sub = run ? 'Test läuft' : !due.last ? 'noch kein Test' : due.due ? 'Test fällig' : `in ${due.inDays} ${due.inDays === 1 ? 'Tag' : 'Tagen'}`;
  return `<a class="tile tile-small" href="#/maxkraft"><span class="ic">${icon('bolt')}</span><span class="tc"><span class="tl">Maximalkraft</span><span class="tsub ${run || due.due ? 'warn' : ''}">${sub}</span></span></a>`;
}
const STATE = {
  up: ['Steigend', 'up', 'stUp'], ok: ['Im Rahmen', 'same', 'stSame'], stagnant: ['Stagniert', 'same', 'stSame'],
  down: ['Schwächer', 'down', 'stDown'], few: ['Zu wenig Daten', 'grey', 'stNone'],
};
function coachReason(x) {
  if (x.state === 'down') return `Geschätztes Maximalgewicht zuletzt ${fmtNum(x.now)} kg – dein Bestwert war ${fmtNum(x.best)} kg (${fmtDate(x.bestDate, 'tiny')}). Über die letzten Trainings ging es eher nach unten.`;
  if (x.state === 'stagnant') return `Seit ${x.since} Trainings (seit ${fmtDate(x.sinceDate, 'tiny')}) keine Steigerung mehr. Bestwert: ${fmtNum(x.best)} kg geschätztes Maximalgewicht.`;
  return '';
}
function viewCoach() {
  const plan = activePlan();
  let h = topbar('Coach');
  if (!plan) return h + '<p class="empty">Kein aktiver Plan.</p>';
  const r = L.coachReport(plan), c = r.counts, issues = r.exercises.filter(x => x.issue);
  const rated = r.exercises.length - c.few;
  const pains = L.painReport(plan).filter(p => p.n4);
  let head, sub, cls;
  if (pains.length) { head = `Achtung: Zwicken ${pains.length === 1 ? 'im Bereich ' + pains[0].name : 'an ' + pains.length + ' Stellen'}`; sub = `Gesundheit geht vor – schau dir die Hinweise unten an.${issues.length ? ` Dazu ${issues.length} ${issues.length === 1 ? 'Übung' : 'Übungen'} mit Handlungsbedarf.` : ''}`; cls = 'down'; }
  else if (!rated) { head = 'Noch zu wenig Daten'; sub = 'Ab 4 Trainings pro Übung kann ich deinen Verlauf bewerten. Bis dahin: dranbleiben!'; cls = 'grey'; }
  else if (c.down && c.stagnant) { head = `${c.down + c.stagnant} Übungen brauchen Aufmerksamkeit`; sub = `${c.stagnant} ${c.stagnant === 1 ? 'stagniert' : 'stagnieren'}, ${c.down} ${c.down === 1 ? 'wird' : 'werden'} schwächer – mit kleinen Anpassungen geht es meist schnell wieder bergauf.`; cls = 'down'; }
  else if (c.down) { head = `${c.down} ${c.down === 1 ? 'Übung wird' : 'Übungen werden'} schwächer`; sub = 'Kein Grund zur Sorge – mit kleinen Anpassungen geht es meist schnell wieder bergauf.'; cls = 'down'; }
  else if (c.stagnant) { head = `${c.stagnant} ${c.stagnant === 1 ? 'Übung stagniert' : 'Übungen stagnieren'}`; sub = 'Der Rest läuft. Zeit für einen neuen Reiz bei diesen Übungen.'; cls = 'same'; }
  else if (c.feelBad) { head = `${c.feelBad} ${c.feelBad === 1 ? 'Übung fühlt' : 'Übungen fühlen'} sich oft schlecht an`; sub = 'Die Zahlen sind noch okay – aber dein Gefühl sagt etwas anderes. Schau dir die Hinweise an.'; cls = 'down'; }
  else { head = 'Starke Entwicklung 💪'; sub = 'Keine Übung stagniert oder wird schwächer. Weiter so!'; cls = 'up'; }
  h += `<p class="muted small">Plan: <b>${esc(plan.name)}</b> · bewertet aus deinen bisherigen Trainings</p>
    <div class="coach-hero s-${cls}"><div class="ch-title">${head}</div><div class="ch-sub">${sub}</div>
    <div class="ch-stats"><span class="s-up">${icon('stUp')}${c.up} steigend</span><span class="s-same">${icon('stSame')}${c.ok + c.stagnant} gleich</span><span class="s-down">${icon('stDown')}${c.down} schwächer</span></div></div>`;
  if (pains.length) {
    h += '<h2>Achtung: Zwicken</h2>';
    for (const p of pains) {
      const exs = plan.exercises.filter(e => p.exercises.includes(e.name));
      h += `<div class="coach-card s-bad"><div class="prow-top"><span class="pname">${esc(p.name)}</span><span class="st">${icon('alert')}${p.n4}× zuletzt</span></div>
        <p class="cc-reason">Zuletzt am ${fmtDate(p.last, 'tiny')} gezwickt${p.n > 1 ? ` – ${p.n}× in deinen letzten Check-ins` : ''}.${exs.length ? ` In deinem Plan belasten diese Stelle besonders: <b>${exs.map(e => esc(e.name)).join(', ')}</b>.` : ''}</p>
        ${p.repeat ? '<p class="cc-warn">Das kam mehrmals vor – lass es bitte ärztlich oder physiotherapeutisch abklären, bevor du schwer weitertrainierst.</p>' : ''}
        <div class="cc-label">Erst probieren</div><ul class="cc-tips"><li>Gewicht reduzieren und nur im schmerzfreien Bewegungsbereich arbeiten</li><li>Länger aufwärmen, die ersten Sätze bewusst leicht</li><li>Schmerz ist ein Stoppsignal – Übung dann lieber auslassen</li></ul>
        ${exs.length ? `<div class="cc-label">Schonendere Alternativen</div><div class="cc-alts">${exs.flatMap(e => L.alternativesFor(e.name).slice(0, 2).map(a => `<button class="cc-alt" data-act="swap" data-ex="${esc(e.id)}" data-name="${esc(a.name)}">${icon('swap')}<span><b>${esc(e.name)} → ${esc(a.name)}</b><small>${esc(a.why)}</small></span></button>`)).join('')}</div>` : ''}</div>`;
    }
  }
  if (issues.length) {
    h += '<h2>Handlungsbedarf</h2>';
    for (const x of issues) {
      const feelOnly = !['stagnant', 'down'].includes(x.state);
      const [label, k, ic] = feelOnly ? ['Fühlt sich schlecht an', 'bad', 'faceBad'] : STATE[x.state];
      let reason = feelOnly ? `In ${x.feel.feels.filter(f => f === 'bad').length} der letzten ${x.feel.feels.length} Trainings mit „schlecht“ bewertet – auch wenn die Zahlen noch passen.` : coachReason(x);
      if (!feelOnly && x.feelTrend === 'bad') reason += ' Dazu fühlte es sich zuletzt eher schlecht an – also zuerst Erholung.';
      if (!feelOnly && x.feelTrend === 'good') reason += ' Es fühlt sich aber gut an – der Reiz ist vermutlich zu sanft.';
      h += `<div class="coach-card s-${k}"><div class="prow-top"><span class="pname">${esc(x.name)}</span><span class="st">${icon(ic)}${label}</span></div>
        <p class="cc-reason">${esc(reason)}</p>
        <div class="cc-label">Erst probieren</div><ul class="cc-tips">${x.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        ${x.alternatives.length ? `<div class="cc-label">Oder Übung wechseln</div><div class="cc-alts">${x.alternatives.map(a => `<button class="cc-alt" data-act="swap" data-ex="${esc(x.id)}" data-name="${esc(a.name)}">${icon('swap')}<span><b>${esc(a.name)}</b><small>${esc(a.why)}</small></span></button>`).join('')}</div>` : ''}
        <a class="cc-link" href="#/fortschritt/uebung/${encodeURIComponent(x.key)}">Verlauf ansehen ›</a></div>`;
    }
  }
  const ready = r.exercises.filter(x => x.feel && x.feel.type === 'ready' && !x.issue);
  if (ready.length) h += `<h2>Bereit für mehr</h2><div class="card cc-ready">${ready.map(x => `<a href="#/fortschritt/uebung/${encodeURIComponent(x.key)}">${icon('faceGood')}<span><b>${esc(x.name)}</b><small>2× in Folge „gut“ – ${x.feel.more === 'weight' ? 'nächstes Mal eine Gewichtsstufe höher' : 'mehr Wiederholungen anpeilen'}</small></span></a>`).join('')}</div>`;
  const pat = L.contextPatterns();
  if (pat.checkins) {
    h += `<h2>Deine Muster</h2><div class="card cc-patterns">${pat.patterns.length
      ? pat.patterns.map(p => `<div class="cc-check ok">${icon('check')}<span><b>${esc(L.patternText(p))}</b><small>aus ${p.n} Trainings mit Check-in</small></span></div>`).join('')
      : `<p class="muted small">${pat.checkins < 6 ? `Ab etwa 6 Check-ins erkenne ich Muster bei Schlaf, Uhrzeit und Essen. Bisher: ${pat.checkins}.` : 'Noch keine deutlichen Unterschiede bei Schlaf, Uhrzeit oder Essen – gut so!'}</p>`}</div>`;
  }
  const ps = L.pumpStats(plan);
  if (ps.total) {
    const heat = {}; for (const [id] of L.MUSCLES) { const q = ps.rate(id); heat[id] = q >= 0.5 ? 4 : q >= 0.25 ? 2 : q > 0 ? 1 : 0; }
    h += `<h2>Dein Pump</h2><div class="card pump-card"><div class="bm-figs"><figure>${bodySVG('front', heat)}<figcaption>vorne</figcaption></figure><figure>${bodySVG('back', heat)}<figcaption>hinten</figcaption></figure></div>
      <p class="small" style="margin-top:8px">Am häufigsten Pump${ps.total > 1 ? ` (letzte ${ps.total} Check-ins)` : ''}: <b>${ps.top.map(id => `${esc(L.muscleName(id))} (${ps.count[id]}×)`).join(', ')}</b></p>
      ${ps.low.length ? `<div class="cc-label">Wenig Pump trotz viel Training</div>${ps.low.map(id => `<div class="pump-tip"><b>${esc(L.muscleName(id))}</b><small>${esc(L.pumpTip(id))}</small></div>`).join('')}` : ps.total < 4 ? '<p class="muted small">Nach 4 Check-ins sage ich dir, welche Muskeln du trotz Training kaum spürst.</p>' : ''}</div>`;
  }
  const good = r.exercises.filter(x => x.state === 'up');
  if (good.length) h += `<h2>Läuft gut</h2><div class="card cc-good">${good.map(x => `<a href="#/fortschritt/uebung/${encodeURIComponent(x.key)}">${icon('stUp')}${esc(x.name)}</a>`).join('')}</div>`;
  // Plan-Check
  const checks = [];
  const balanced = r.pull >= r.push * 0.8;
  checks.push([balanced, `Drücken ${r.push} · Ziehen ${r.pull} Sätze pro Training`, balanced ? 'ausgewogen – gut für Haltung und Schultern' : 'mehr Zugübungen (z. B. Rudern) einplanen']);
  checks.push([r.minutes <= 80, `Dauer ca. ${r.minutes} Minuten`, r.minutes <= 80 ? 'mit Pausen laut Plan und 10 min Aufwärmen' : 'recht lang – Supersätze oder weniger Sätze sparen Zeit']);
  const avg = r.weeks.reduce((a, b) => a + b, 0) / r.weeks.length;
  checks.push([avg >= r.goal * 0.75, `Regelmäßigkeit: Ø ${fmtNum(round1(avg))} von ${r.goal} Trainings pro Woche`, `letzte 4 Wochen: ${r.weeks.join(' · ')}`]);
  const lastS = doneSessions().filter(x => x.kind !== 'baseline').at(-1);
  if (lastS && L.dayFeel(lastS).tough) checks.push([false, `Letztes Training (${fmtDate(lastS.date, 'tiny')}) fühlte sich schwer an`, 'viele „schlecht“-Bewertungen – eher Tagesform: Schlaf, Stress, Essen']);
  if (L.checkinTrend().bad) checks.push([false, 'Mehrere Trainings fühlten sich insgesamt schlecht an', 'Erholung einplanen: Schlaf, Essen, eventuell eine leichtere Woche']);
  const md = L.maxTestDue();
  checks.push([md.last ? !md.due : null, md.last ? `Maximalkrafttest zuletzt am ${fmtDate(md.last, 'tiny')}` : 'Noch kein Maximalkrafttest', md.last ? (md.due ? 'fällig – unter „Maximalkraft“ starten' : `nächster in ${md.inDays} Tagen`) : 'ermittle deinen Ausgangswert unter „Maximalkraft“']);
  const names = plan.exercises.map(e => normKey(e.name));
  if (names.some(n => /squat|kniebeuge/.test(n)) && names.some(n => /kreuzheben/.test(n)))
    checks.push([null, 'Squats und Kreuzheben in jedem Training', 'belastet den unteren Rücken – bei steigenden Gewichten abwechseln']);
  if (r.weak.length) checks.push([null, `Kaum trainiert: ${r.weak.join(', ')}`, 'nur wichtig, wenn diese Bereiche für dich zählen']);
  h += `<h2>Plan-Check</h2><div class="card cc-checks">${checks.map(([ok, t, d]) => `<div class="cc-check ${ok === true ? 'ok' : ok === false ? 'warn' : 'info'}">${icon(ok === true ? 'check' : ok === false ? 'alert' : 'stNone')}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></div>`).join('')}</div>`;
  const few = r.exercises.filter(x => x.state === 'few');
  if (few.length && rated) h += `<p class="muted small" style="margin-top:12px">Noch zu wenig Daten (unter 4 Trainings): ${few.map(x => esc(x.name)).join(', ')}</p>`;
  h += '<p class="muted small">Der Coach gibt allgemeine Trainingshinweise auf Basis deiner Einträge – keine medizinische Beratung.</p>';
  return h;
}

/* ---------------- Maximalkraft ---------------- */
function currentTest() { const m = location.hash.match(/^#\/maxkraft\/test\/([^/]+)$/); return m && (db.maxTests || []).find(t => t.id === m[1]); }
const kg = w => `${fmtNum(w)} kg`;
function maxResultRow(e) {
  const key = normKey(e.name), hist = L.maxTestHistory(key);
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  if (!last) {
    const est = L.currentE1(key);
    return `<div class="mx-row"><div class="c-main"><span class="pname">${esc(e.name)}</span><span class="c-delta">${est ? `aus dem Training geschätzt: ca. ${kg(round1(est.e1))}` : 'noch keine Werte'}</span></div><span class="mx-val muted">–</span></div>`;
  }
  const d = prev ? (last.result.e1 / prev.result.e1 - 1) * 100 : null;
  return `<div class="mx-row"><div class="c-main"><span class="pname">${esc(e.name)}</span>
    <span class="c-delta">${last.result.w5 ? `5RM ${kg(last.result.w5)} × 5` : 'kein voller 5er'} · ${fmtDate(last.date, 'tiny')}${d != null ? ` · <b class="${d > 0.5 ? 'c-up' : d < -0.5 ? 'c-down' : ''}">${fmtPct(d)}</b>` : ''}</span></div>
    ${sparkline(hist.map(x => x.result.e1))}<span class="mx-val"><b>${fmtNum(round1(last.result.e1))}</b><small>kg 1RM</small></span></div>`;
}
function viewMax() {
  const plan = activePlan();
  let h = topbar('Maximalkraft');
  if (!plan) return h + '<p class="empty">Kein aktiver Plan.</p>';
  const run = (db.maxTests || []).find(t => t.status === 'active'), due = L.maxTestDue();
  const exs = plan.exercises.filter(e => L.maxCategory(e.name) >= 0);
  const weeks = Math.round(due.every / 7);
  let title, sub;
  if (run) { title = 'Test läuft'; sub = `Begonnen am ${fmtDate(run.date, 'tiny')}`; }
  else if (!due.last) { title = 'Noch kein Test'; sub = 'Ermittle deine Ausgangswerte – danach siehst du hier deine Entwicklung.'; }
  else if (due.due) { title = 'Test fällig'; sub = `Letzter Test vor ${due.days} Tagen (${fmtDate(due.last, 'tiny')}).`; }
  else { title = `Nächster Test in ${due.inDays} ${due.inDays === 1 ? 'Tag' : 'Tagen'}`; sub = `Letzter Test am ${fmtDate(due.last, 'tiny')}.`; }
  h += `<div class="coach-hero ${run || due.due ? 's-up' : ''}"><div class="ch-title">${title}</div><div class="ch-sub">${sub}</div>
    <button class="btn-primary btn-block btn-big" style="margin-top:12px" data-act="max-start">${icon('bolt')}${run ? 'Test fortsetzen' : 'Test starten'}</button></div>
    <h2>Deine Maximalkraft</h2><p class="muted small list-hint">Geschätztes Maximalgewicht (1RM) aus dem schwersten sauberen 5er</p>
    <div class="card mx-list">${exs.map(maxResultRow).join('') || '<p class="muted">Keine passenden Grundübungen im Plan.</p>'}</div>
    <details class="card mx-how"><summary>So läuft der Test</summary>
      <ol><li>5–10 Minuten allgemein aufwärmen.</li><li>Pro Übung die vorgeschlagenen Aufwärmsätze machen.</li>
      <li>Erster Versuch mit dem vorgeschlagenen Gewicht: so viele saubere Wiederholungen wie möglich, höchstens bis die Technik leidet.</li>
      <li>5 oder mehr geschafft? Nach 3 Minuten Pause schwerer – die App schlägt das Gewicht vor.</li>
      <li>Weniger als 5 oder 5 Versuche erreicht: fertig. Es zählt der schwerste saubere 5er.</li>
      <li>Reihenfolge wie im Training – so bleiben die Tests untereinander und mit dem Training vergleichbar. Vor Kreuzheben direkt nach Squats 5 Minuten Pause.</li>
      <li>Squats und Bankdrücken mit Sicherung (Ablagen/Partner).</li></ol>
      <p class="muted small">Ein Test ersetzt ein normales Training. Teste ausgeruht, nicht nach einer harten Woche.</p></details>
    <h2>Rhythmus</h2><div class="card goal-card"><span class="spacer">Test alle</span>
      <button class="btn-icon" data-act="max-every" data-d="-1" ${weeks <= 2 ? 'disabled' : ''} aria-label="kürzer">−</button><b class="goal-n">${weeks}</b>
      <button class="btn-icon" data-act="max-every" data-d="1" ${weeks >= 16 ? 'disabled' : ''} aria-label="länger">+</button><span>Wochen</span></div>`;
  const done = (db.maxTests || []).filter(t => t.status === 'done').sort(L.sessionOrder).reverse();
  if (done.length) h += `<h2>Bisherige Tests</h2>${done.map(t => `<a class="card link row" href="#/maxkraft/test/${t.id}"><span class="spacer"><b>${fmtDate(t.date, 'long')}</b><span class="muted small" style="display:block">${t.exercises.filter(e => !e.skipped && e.attempts.length).length} Übungen getestet</span></span><span class="muted">›</span></a>`).join('')}`;
  return h;
}
function viewMaxTest(id) {
  const t = currentTest();
  if (!t) return topbar('Maximalkrafttest', '#/maxkraft') + '<p class="empty">Test nicht gefunden.</p>';
  let h = topbar('Maximalkrafttest', '#/maxkraft', true);
  const doneN = t.exercises.filter(e => e.skipped || L.maxTestState(e).done).length;
  h += `<div class="wk-info"><div class="row"><div class="spacer"><b>${doneN} von ${t.exercises.length} Übungen fertig</b>
    <div class="muted small">Reihenfolge wie im Training · 3 Minuten Pause zwischen den Versuchen</div></div>
    <label class="date-lbl"><span class="muted small">Datum</span><input type="date" data-act="mx-date" value="${t.date}" max="${todayISO()}" aria-label="Datum"></label></div>
    <div class="progress"><div style="width:${Math.round(doneN / Math.max(1, t.exercises.length) * 100)}%"></div></div></div>`;
  t.exercises.forEach((ex, i) => {
    const st = L.maxTestState(ex), plan = L.maxTestPlan(ex.key, ex.perDumbbell);
    const headTag = ex.skipped ? '<span class="tag">übersprungen</span>' : st.done ? `<span class="tag green">${icon('check')}fertig</span>` : '';
    h += `<section class="ex-card mx-card ${st.done ? 'mx-done' : ''}"><div class="ex-head"><h3>${i + 1}. ${esc(ex.name)}</h3>${ex.perDumbbell ? '<span class="pd">pro Hantel</span>' : ''}${headTag}</div>`;
    if (ex.skipped) { h += `<div class="ex-actions"><button data-act="mx-unskip" data-mx="${i}">Doch testen</button></div></section>`; return; }
    h += `<p class="last">${plan.expected ? `Erwartet: ca. <b>${kg(roundStepUI(plan.expected, plan.step))} × 5</b> · aktuelles 1RM ca. ${kg(round1(plan.expected * (1 + 5 / 30)))}` : 'Noch keine Werte – beginne leicht und steigere dich.'}</p>`;
    if (plan.warmups.length && !st.done) h += `<div class="cc-label">Aufwärmen (antippen, wenn erledigt)</div><div class="mx-warm">${plan.warmups.map((w, k) => `<button class="chip ${ex.warmDone.includes(k) ? 'on' : ''}" data-act="mx-warm" data-mx="${i}" data-k="${k}">${ex.warmDone.includes(k) ? icon('check') : ''}${kg(w.w)} × ${w.r}</button>`).join('')}</div>`;
    h += '<div class="cc-label">Versuche</div><div class="sets">';
    const rows = ex.attempts.length + (st.done ? 0 : 1);
    for (let k = 0; k < rows; k++) {
      const a = ex.attempts[k] || { w: k === 0 ? plan.start : st.next, r: null };
      h += `<div class="set-row mx-set ${isValidSet(a) ? 'complete' : ''}"><span class="no">${k + 1}</span>
        <input type="text" inputmode="decimal" autocomplete="off" data-mx="${i}" data-at="${k}" data-f="w" value="${fmtNum(a.w)}" placeholder="kg" aria-label="Versuch ${k + 1} Gewicht">
        <span class="x">×</span>
        <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-mx="${i}" data-at="${k}" data-f="r" value="${a.r ?? ''}" placeholder="Wdh." aria-label="Versuch ${k + 1} Wiederholungen"></div>`;
    }
    h += `</div><p class="mx-msg ${st.done ? 'done' : ''}">${esc(st.msg)}</p>`;
    if (st.result && st.result.e1) {
      const hist = L.maxTestHistory(ex.key).filter(x => x.testId !== t.id), prev = hist[hist.length - 1];
      const d = prev ? (st.result.e1 / prev.result.e1 - 1) * 100 : null;
      h += `<div class="mx-result"><div><span>5RM</span><b>${st.result.w5 ? kg(st.result.w5) : '–'}</b></div><div><span>Maximalkraft (1RM)</span><b>ca. ${kg(round1(st.result.e1))}</b></div>
        ${d != null ? `<div><span>seit ${fmtDate(prev.date, 'tiny')}</span><b class="${d > 0.5 ? 'c-up' : d < -0.5 ? 'c-down' : ''}">${fmtPct(d)}</b></div>` : ''}</div>`;
    }
    h += `<div class="ex-actions">${st.done ? '' : `<button data-act="mx-skip" data-mx="${i}">Überspringen</button>`}${ex.attempts.length && st.done ? `<button data-act="mx-more" data-mx="${i}">Noch ein Versuch</button>` : ''}</div></section>`;
  });
  h += '<div class="wk-footer stack">';
  if (t.status === 'active') h += `<button class="btn-primary btn-block btn-big" data-act="mx-finish">Test abschließen</button><button class="btn-danger btn-block" data-act="mx-discard">Test verwerfen</button>`;
  else h += `<a class="btn btn-primary btn-block btn-big" href="#/maxkraft">Fertig</a><button class="btn-danger btn-block" data-act="mx-discard">Test löschen</button>`;
  return h + '</div>';
}
const roundStepUI = (w, step) => Math.round(w / step) * step;

/* ---------------- Übungsdetail ---------------- */
const chartMode = {};
function viewExercise(key, outlook) {
  const back = outlook ? '#/ausblick' : '#/fortschritt';
  const hist = exerciseHistory(key);
  const all = doneSessions().map(s => ({ s, ex: s.exercises.find(e => L.sameEx(e.key, key)) })).filter(x => x.ex);
  const planEx = (activePlan()?.exercises || []).find(e => L.sameEx(normKey(e.name), key));
  const name = planEx ? planEx.name : all.length ? all[all.length - 1].ex.name : key;
  const perDumbbell = planEx ? planEx.perDumbbell : (all.length && all[all.length - 1].ex.perDumbbell);
  let h = topbar(name, back, true);
  if (perDumbbell) h += '<p class="muted small">Gewichte pro Hantel</p>';
  h += `<div class="detail-note">${noteBlock(key) || `<button class="note-line empty-note" data-act="note" data-key="${esc(key)}">${icon('note')}Notiz hinzufügen (z. B. Sitzhöhe)</button>`}</div>`;
  if (!hist.length) return h + '<p class="empty">Noch keine Einträge für diese Übung.</p>';
  if (!outlook) {
    const a = latestProgress(key);
    h += statusRow({ st: a.status, name: 'Letztes Training', text: a.text, meta: metaFor(a), href: a.session ? `#/ergebnis/${a.session.id}` : '#/fortschritt',
      prs: a.session ? L.recordsFor(a.session, a.session.exercises.find(e => L.sameEx(e.key, key))) : [] });
  }
  if (outlook) {
    const f = forecastFor(key, outlookDays, perDumbbell);
    h += periodSeg() + outlookNote;
    const pts = hist.map(e => ({ d: e.session.date, y: bestE1(e.sets) }));
    h += `<div class="chart-wrap"><div class="chart-title"><span>Geschätztes Maximalgewicht (kg)</span></div>
      ${lineChart({ points: pts, timeScale: true, unit: 'kg', curve: f.status === 'few' ? null : curveDays(outlookDays).map(t => ({ d: addDaysISO(f.lastDate, t), y: f.at(t) })) })}
      <p class="chart-note">durchgezogen: bisher · gestrichelt: Prognose</p></div>
      <div class="card"><b>${esc(forecastText(name, f, outlookDays))}</b>
      ${f.status !== 'few' ? `<p class="muted small">Trend der letzten ${f.n} Trainings: ${fmtPct(f.weeklyPct)} pro Woche${f.capped ? `, gedeckelt auf ${fmtPct(L.MAX_WEEKLY * 100)} und mit der Zeit abflachend` : ''}${f.status === 'flat' ? ' – aktuell kein Anstieg, daher keine sinkende Prognose' : ''}. Gerundet auf ${perDumbbell ? '1 kg' : '2,5 kg'}.</p>` : ''}</div>`;
  } else {
    const weights = [...new Set(hist.flatMap(e => e.sets.map(s => s.w)))].sort((a, b) => a - b);
    let mode = chartMode[key] ?? '1rm';
    if (mode !== '1rm' && !weights.includes(mode)) mode = '1rm';
    const recent = hist.slice(-12);
    let pts, title;
    if (mode === '1rm') { title = 'Geschätztes Maximalgewicht (1RM, kg)'; pts = recent.map(e => ({ d: e.session.date, y: bestE1(e.sets) })); }
    else {
      title = `Wiederholungen bei ${fmtNum(mode)} kg (bester Satz)`;
      pts = recent.filter(e => e.sets.some(s => s.w === mode)).map(e => ({ d: e.session.date, y: Math.max(...e.sets.filter(s => s.w === mode).map(s => s.r)) }));
    }
    h += `<div class="chart-wrap"><div class="chart-title"><span>${title}</span></div>${lineChart({ points: pts, unit: mode === '1rm' ? 'kg' : '' })}
      <div class="chips"><button class="chip ${mode === '1rm' ? 'on' : ''}" data-act="chart-mode" data-key="${esc(key)}" data-m="1rm">1RM</button>
      ${weights.map(w => `<button class="chip ${w === mode ? 'on' : ''}" data-act="chart-mode" data-key="${esc(key)}" data-m="${w}">Wdh. bei ${fmtNum(w)} kg</button>`).join('')}</div></div>`;
  }
  h += '<h2>Alle Trainings</h2><table class="hist"><tr><th>Datum</th><th>Sätze (kg × Wdh.)</th><th>Bewertung</th></tr>';
  for (let i = all.length - 1; i >= 0; i--) {
    const { s, ex } = all[i];
    const a = analyzeExercise(s, ex);
    h += `<tr><td><a href="#/ergebnis/${s.id}">${fmtDate(s.date)}</a>${s.kind === 'baseline' ? '<br><span class="tag">Startwerte</span>' : ''}${ex.name !== name ? `<br><span class="muted small">als ${esc(ex.name)}</span>` : ''}</td>
      <td>${ex.skipped ? '<span class="muted">übersprungen</span>' : validSets(ex).map(x => `${fmtNum(x.w)} × ${x.r}`).join('<br>')}</td>
      <td><span class="st-mini s-${CLS[a.status]}">${icon(STATUS[a.status].icon)}${STATUS[a.status].label}</span>${ex.feel ? `<br>${feelChip(ex.feel)}` : ''}</td></tr>`;
  }
  return h + '</table>';
}

/* ---------------- Pläne ---------------- */
function viewPlans() {
  let h = topbar('Trainingspläne') + '<p class="muted small">Tippe auf einen Plan, um ihn als aktiven Plan auszuwählen.</p>';
  for (const p of db.plans) {
    const on = p.id === db.activePlanId;
    h += `<div class="card plan-card ${on ? 'on' : ''}"><button class="plan-pick" data-act="activate" data-plan="${p.id}">
      <span class="radio">${on ? '✓' : ''}</span><span class="spacer"><b>${esc(p.name)}</b><span class="muted small">${p.exercises.length} Übungen${on ? ' · aktiv' : ''}</span></span></button>
      <a class="btn btn-ghost btn-small" href="#/plan/${p.id}">Bearbeiten</a>${p.exercises.length ? bodyMap(p) : ''}</div>`;
  }
  const goal = db.settings?.weeklyGoal || 3;
  h += `<button class="btn-ghost btn-block" data-act="new-plan">+ Neuer Plan</button>
    <h2>Wochenziel</h2><div class="card goal-card"><span class="spacer">Trainings pro Woche</span>
    <button class="btn-icon" data-act="goal" data-d="-1" ${goal <= 1 ? 'disabled' : ''} aria-label="weniger">−</button><b class="goal-n">${goal}</b>
    <button class="btn-icon" data-act="goal" data-d="1" ${goal >= 7 ? 'disabled' : ''} aria-label="mehr">+</button></div>
    <h2>Sicherung</h2><div class="card stack">
    <p class="small muted">Deine Daten liegen nur auf diesem Gerät. Exportiere regelmäßig eine Sicherung (z. B. in „Dateien“ oder iCloud).
    Letzte Sicherung: <b>${db.lastExport ? new Date(db.lastExport).toLocaleDateString('de-DE') : 'noch nie'}</b></p>
    <button class="btn-primary btn-block" data-act="export">Daten exportieren</button>
    <label class="btn btn-ghost btn-block">Sicherung importieren<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>`;
  return h;
}
function planExRow(p, e, idx, inGroup, first, last, canLink) {
  const info = [`${e.sets} Sätze`, e.guide != null ? `${fmtNum(e.guide)} kg` : null, e.perDumbbell ? 'pro Hantel' : null].filter(Boolean).join(' · ');
  return `<div class="plan-ex"><a class="info" href="#/plan/${p.id}/uebung/${e.id}"><b>${esc(e.name)}</b><span class="muted small">${info}</span></a>
    <button class="btn-icon" data-act="${inGroup ? 'move-in' : 'move-block'}" data-idx="${idx}" data-d="-1" ${first ? 'disabled' : ''} aria-label="nach oben">${icon('up')}</button>
    <button class="btn-icon" data-act="${inGroup ? 'move-in' : 'move-block'}" data-idx="${idx}" data-d="1" ${last ? 'disabled' : ''} aria-label="nach unten">${icon('down')}</button>
    ${!inGroup ? `<button class="btn-icon" data-act="link" data-idx="${idx}" ${canLink ? '' : 'disabled'} aria-label="Mit nächster Übung als Supersatz verbinden" title="Mit nächster Übung als Supersatz verbinden">${icon('link')}</button>` : ''}</div>`;
}
function viewPlanEdit(id) {
  const p = getPlan(id);
  if (!p) return topbar('Plan', '#/plaene', true) + '<p class="empty">Plan nicht gefunden.</p>';
  const bl = blocks(p.exercises);
  let h = topbar('Plan bearbeiten', '#/plaene', true) + `<label class="field"><span>Name</span><input data-plan-f="name" value="${esc(p.name)}"></label>
    <h2>Übungen</h2><p class="muted small help-icons">${icon('up')}${icon('down')} ändert die Reihenfolge · ${icon('link')} verbindet eine Übung mit der nächsten zu einem Supersatz.</p><div class="card">`;
  bl.forEach((b, bi) => {
    if (b.group) {
      h += `<div class="plan-group"><div class="plan-group-head"><b class="spacer">Supersatz ${esc(b.group)}</b>
        <button class="btn-icon" data-act="move-block" data-idx="${b.items[0].idx}" data-d="-1" ${bi === 0 ? 'disabled' : ''} aria-label="Supersatz nach oben">${icon('up')}</button>
        <button class="btn-icon" data-act="move-block" data-idx="${b.items[0].idx}" data-d="1" ${bi === bl.length - 1 ? 'disabled' : ''} aria-label="Supersatz nach unten">${icon('down')}</button>
        <button class="btn-small btn-ghost" data-act="unlink" data-group="${esc(b.group)}">Auflösen</button></div>
        ${b.items.map((it, k) => planExRow(p, it.ex, it.idx, true, k === 0, k === b.items.length - 1)).join('')}</div>`;
    } else {
      const it = b.items[0];
      h += planExRow(p, it.ex, it.idx, false, bi === 0, bi === bl.length - 1, bi < bl.length - 1);
    }
  });
  if (!p.exercises.length) h += '<p class="muted">Noch keine Übungen.</p>';
  h += `</div><button class="btn-ghost btn-block" data-act="add-ex">+ Übung hinzufügen</button>
    <p class="muted small" style="margin-top:14px">Änderungen gelten nur für künftige Trainings – gespeicherte Trainings bleiben unverändert.</p>
    <div class="stack" style="margin-top:14px"><button class="btn-ghost btn-block" data-act="dup-plan">Plan duplizieren</button>
    <button class="btn-danger btn-block" data-act="del-plan">Plan löschen</button></div>`;
  return h;
}
function viewSlotEdit(pid, eid) {
  const p = getPlan(pid), e = p && p.exercises.find(x => x.id === eid);
  if (!e) return topbar('Übung', '#/plaene', true) + '<p class="empty">Übung nicht gefunden.</p>';
  const groups = [...new Set(p.exercises.map(x => x.group).filter(Boolean))];
  return topbar('Übung bearbeiten', `#/plan/${p.id}`, true) + `
    <label class="field"><span>Name</span><input data-slot="name" value="${esc(e.name)}"></label>
    <div class="grid2"><label class="field"><span>Sätze</span><input data-slot="sets" inputmode="numeric" pattern="[0-9]*" value="${e.sets}"></label>
      <label class="field"><span>Orientierungsgewicht (kg)</span><input data-slot="guide" inputmode="decimal" value="${fmtNum(e.guide)}" placeholder="optional"></label></div>
    <label class="field"><span>${e.group ? `Pause nach jeder Runde in Sekunden (gilt für den ganzen Supersatz ${esc(e.group)})` : 'Pause nach jedem Satz in Sekunden'}</span>
      <input data-slot="rest" inputmode="numeric" pattern="[0-9]*" value="${L.restOf(e)}"></label>
    <label class="check"><input type="checkbox" data-slot="perDumbbell" ${e.perDumbbell ? 'checked' : ''}> Kurzhantel – Gewicht pro Hantel</label>
    <label class="field" style="margin-top:8px"><span>Supersatz</span><select data-slot="group">
      <option value="">Kein Supersatz (Einzelübung)</option>
      ${groups.map(g => `<option value="${esc(g)}" ${e.group === g ? 'selected' : ''}>Supersatz ${esc(g)}</option>`).join('')}</select></label>
    <label class="field"><span>Notiz (erscheint im Training, z. B. Sitzhöhe oder Griff)</span><input data-slot-note="${esc(normKey(e.name))}" value="${esc(L.noteFor(normKey(e.name)))}" placeholder="optional"></label>
    <p class="muted small">Beim Umbenennen fragt die App, ob der bisherige Verlauf unter dem neuen Namen weiterläuft.</p>
    <div class="stack"><a class="btn btn-primary btn-block" href="#/plan/${p.id}">Fertig</a>
    <button class="btn-danger btn-block" data-act="del-ex">Übung aus Plan entfernen</button></div>`;
}

/* ---------------- Ereignisse ---------------- */
function currentSession() { const m = location.hash.match(/^#\/training\/([^/]+)$/); return m && getSession(m[1]); }
function currentPlan() { const m = location.hash.match(/^#\/plan\/([^/]+)/); return m && getPlan(m[1]); }
function currentSlot(p) { return p.exercises.find(x => x.id === location.hash.split('/').pop()); }
function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function inputEl(i, j, f) { return $app.querySelector(`input[data-ex="${i}"][data-set="${j}"][data-f="${f}"]`); }
function setInput(i, j, f, val) { const el = inputEl(i, j, f); if (el) { el.value = f === 'w' ? fmtNum(val) : (val ?? ''); el.classList.remove('invalid'); } }
function markRow(i, j) {
  const s = currentSession(), el = inputEl(i, j, 'w');
  if (el) el.closest('.set-row').classList.toggle('complete', isValidSet(s.exercises[i].sets[j]));
}
function focusNext(el) {
  const all = [...$app.querySelectorAll('input[data-f]')];
  const next = all[all.indexOf(el) + 1];
  if (next) { next.focus(); try { next.setSelectionRange(0, next.value.length); } catch (e) { /* ignorieren */ } }
  else el.blur();
}
function fillFromPrev(s, i) {
  const ex = s.exercises[i], prev = previousEntry(ex.key, s);
  if (!prev || ex.skipped) return;
  const work = prev.ex.sets.filter(L.isWorkSet);
  let w = 0;
  ex.sets.forEach(x => { if (!x.warm && work[w]) { x.w = work[w].w; x.r = work[w].r; w++; } });
  for (; w < work.length; w++) ex.sets.push({ w: work[w].w, r: work[w].r });
  if (!s.startedAt && s.status === 'active') s.startedAt = Date.now();
}

function mxInput(t, final) {
  const test = currentTest(); if (!test) return;
  const ex = test.exercises[+t.dataset.mx], k = +t.dataset.at;
  const rowW = $app.querySelector(`input[data-mx="${t.dataset.mx}"][data-at="${k}"][data-f="w"]`);
  const rowR = $app.querySelector(`input[data-mx="${t.dataset.mx}"][data-at="${k}"][data-f="r"]`);
  const w = parseNum(rowW.value), r = parseInt0(rowR.value);
  t.classList.toggle('invalid', Number.isNaN(t.dataset.f === 'w' ? w : r));
  const wasValid = !!ex.attempts[k] && isValidSet(ex.attempts[k]);
  if (!ex.attempts[k]) { if (r == null || Number.isNaN(r)) return; ex.attempts[k] = { w: null, r: null }; }
  ex.attempts[k].w = Number.isNaN(w) ? null : w; ex.attempts[k].r = Number.isNaN(r) ? null : r;
  save();
  const nowValid = isValidSet(ex.attempts[k]);
  const complete = t.dataset.f === 'r' && r != null && !Number.isNaN(r) && (final || t.value.length >= 2 || r >= 4);
  if (complete && nowValid) {
    rerenderKeepScroll();
    if (!wasValid && test.status === 'active') {
      const st = L.maxTestState(ex), nextEx = test.exercises.slice(+t.dataset.mx + 1).find(e => !e.skipped);
      Rest.start(st.done && nextEx ? L.maxRestBefore(ex.name, nextEx.name) : 180, st.done ? (nextEx ? `${nextEx.name} (aufwärmen)` : 'Test abschließen') : `${ex.name} · ${fmtNum(st.next)} kg`);
    }
  }
}
$app.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.mx != null && t.dataset.f) { mxInput(t, false); return; }
  if (t.dataset.f) {
    const s = currentSession(); if (!s) return;
    const i = +t.dataset.ex, j = +t.dataset.set, set = s.exercises[i].sets[j];
    const v = t.dataset.f === 'w' ? parseNum(t.value) : parseInt0(t.value);
    const wasValid = isValidSet(set);
    t.classList.toggle('invalid', Number.isNaN(v));
    set[t.dataset.f] = Number.isNaN(v) ? null : v;
    if (!wasValid && isValidSet(set) && !s.startedAt && s.status === 'active') s.startedAt = Date.now();
    save(); markRow(i, j); refreshFeel(s, i);
    { const st = document.getElementById('wk-stats'); if (st) st.innerHTML = liveStats(s); }
    if (!wasValid) Rest.afterSet(s, i, j, t);
    // Kurzer Weg: nach vollständiger Wiederholungszahl ins nächste Feld springen
    if (t.dataset.f === 'r' && v != null && !Number.isNaN(v) && (t.value.length >= 2 || v >= 4)) focusNext(t);
    return;
  }
  if (t.dataset.note != null) { L.setNote(t.dataset.note, t.value); save(); return; }
  if (t.dataset.slotNote != null) { L.setNote(t.dataset.slotNote, t.value); save(); return; }
  const p = currentPlan(); if (!p) return;
  if (t.dataset.planF === 'name') { if (t.value.trim()) { p.name = t.value.trim(); save(); } }
  else if (t.dataset.slot) {
    const e = currentSlot(p), f = t.dataset.slot;
    if (f === 'name') { if (t.value.trim()) e.name = t.value.trim(); }
    else if (f === 'guide') { const v = parseNum(t.value); t.classList.toggle('invalid', Number.isNaN(v)); if (!Number.isNaN(v)) e.guide = v; }
    else if (f === 'rest') {
      const v = parseInt0(t.value); const ok = v != null && !Number.isNaN(v) && v >= 0 && v <= 600;
      t.classList.toggle('invalid', !ok);
      if (ok) { e.rest = v; if (e.group) p.exercises.forEach(x => { if (x.group === e.group) x.rest = v; }); }
    }
    else if (f === 'sets') { const v = parseInt0(t.value); const ok = v != null && !Number.isNaN(v) && v > 0 && v <= 20; t.classList.toggle('invalid', !ok); if (ok) e.sets = v; }
    else return;
    save();
  }
});

$app.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.mx != null && t.dataset.f) { if (t.dataset.f === 'r') mxInput(t, true); return; }
  if (t.dataset.act === 'mx-date') { const test = currentTest(); if (test && t.value) { test.date = t.value > todayISO() ? todayISO() : t.value; save(); toast('Datum geändert'); } return; }
  if (t.dataset.act === 'date') { const s = currentSession(); if (t.value) { s.date = t.value > todayISO() ? todayISO() : t.value; save(); rerenderKeepScroll(); toast('Datum geändert'); } return; }
  if (t.dataset.f === 'w') {
    // Neues Gewicht an die folgenden Sätze derselben Übung weitergeben, solange dort noch keine
    // Wiederholungen stehen und das Gewicht leer ist oder dem bisherigen (vorausgefüllten) Wert entspricht
    const s = currentSession(), i = +t.dataset.ex, ex = s.exercises[i], w = ex.sets[+t.dataset.set].w;
    const old = t.dataset.before === '' || t.dataset.before == null ? null : parseFloat(t.dataset.before);
    t.dataset.before = w ?? '';
    if (w == null) return;
    for (let j = +t.dataset.set + 1; j < ex.sets.length; j++) {
      const x = ex.sets[j];
      if (x.r == null && (x.w == null || x.w === old)) { x.w = w; setInput(i, j, 'w', w); }
    }
    save(); return;
  }
  if (t.dataset.act === 'import') { importFile(t.files[0]); t.value = ''; return; }
  const p = currentPlan(); if (!p) return;
  if (t.dataset.slot === 'name') {
    // Umbenennen: bisherigen Verlauf weiterführen oder neu beginnen?
    const e = currentSlot(p), oldName = t.dataset.before || '', newName = e.name;
    t.dataset.before = newName;
    if (oldName && normKey(oldName) !== normKey(newName) && exerciseHistory(normKey(oldName)).length &&
        confirm(`Bisherigen Verlauf von „${oldName}“ unter „${newName}“ weiterführen?\n\nOK: Ja – „Letztes Mal“, Vergleich und Fortschritt laufen weiter (z. B. bei Tippfehler oder gleichwertiger Übung).\nAbbrechen: „${newName}“ beginnt mit einem eigenen, neuen Verlauf.`)) {
      L.renameExercise(oldName, newName); save(); toast('Verlauf wird weitergeführt');
    }
    return;
  }
  if (t.dataset.slot === 'perDumbbell') { currentSlot(p).perDumbbell = t.checked; save(); }
  if (t.dataset.slot === 'group') { const e = currentSlot(p); e.group = t.value || null; normalizeGroups(p); L.unifyGroupRest(p.exercises); save(); toast(e.group ? `Zu Supersatz ${e.group} hinzugefügt` : 'Aus Supersatz entfernt'); rerenderKeepScroll(); }
});

// Gewicht beim Betreten des Feldes merken, damit eine Änderung an die Folgesätze weitergegeben werden kann
$app.addEventListener('focusin', ev => {
  const t = ev.target;
  if (t.dataset && t.dataset.slot === 'name' && t.dataset.before == null) t.dataset.before = t.value;
  if (t.dataset && t.dataset.f === 'w') { const s = currentSession(); const w = s && s.exercises[+t.dataset.ex].sets[+t.dataset.set].w; t.dataset.before = w ?? ''; }
});

$app.addEventListener('focusout', ev => {
  if (ev.target.classList && ev.target.classList.contains('note-input')) { editingNote = null; setTimeout(rerenderKeepScroll, 0); }
});
$app.addEventListener('click', ev => {
  const hit = ev.target.closest && ev.target.closest('.hit');
  if (!hit) return;
  const wrap = hit.closest('.chart-wrap'), tip = wrap && wrap.querySelector('.chart-tip');
  if (tip) { tip.textContent = hit.dataset.tip; tip.classList.add('on'); }
  wrap.querySelectorAll('.hit.sel').forEach(x => x.classList.remove('sel')); hit.classList.add('sel');
});

$app.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.classList.contains('note-input')) { ev.preventDefault(); ev.target.blur(); return; }
  if (ev.key !== 'Enter' || !ev.target.dataset.f) return;
  ev.preventDefault(); focusNext(ev.target);
});

function moveBlock(p, idx, d) {
  const bl = blocks(p.exercises), bi = bl.findIndex(b => b.items.some(it => it.idx === idx)), bj = bi + d;
  if (bj < 0 || bj >= bl.length) return;
  [bl[bi], bl[bj]] = [bl[bj], bl[bi]];
  p.exercises = bl.flatMap(b => b.items.map(it => it.ex));
}

$app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.disabled) return;
  const act = b.dataset.act, s = currentSession(), p = currentPlan();
  const ex = s && b.dataset.ex != null ? s.exercises[+b.dataset.ex] : null;
  switch (act) {
    case 'take': {
      const i = +b.dataset.ex, j = +b.dataset.set, set = ex.sets[j];
      const wasValid = isValidSet(set);
      set.w = parseFloat(b.dataset.w); set.r = parseInt(b.dataset.r, 10);
      setInput(i, j, 'w', set.w); setInput(i, j, 'r', set.r); save(); markRow(i, j); refreshFeel(s, i);
      if (!wasValid) Rest.afterSet(s, i, j, inputEl(i, j, 'r'));
      break;
    }
    case 'take-all': fillFromPrev(s, +b.dataset.ex); save(); rerenderKeepScroll(); toast('Werte vom letzten Mal übernommen'); break;
    case 'take-group': s.exercises.forEach((e, i) => { if (e.group === b.dataset.group) fillFromPrev(s, i); }); save(); rerenderKeepScroll(); toast('Supersatz vorbefüllt'); break;
    case 'skip': ex.skipped = true; save(); rerenderKeepScroll(); break;
    case 'add-warm': {
      const first = ex.sets.find(x => !x.warm && x.w != null), step = ex.perDumbbell ? 1 : 2.5;
      const w = first ? Math.max(step, Math.round(first.w * 0.5 / step) * step) : null;
      const at = ex.sets.findIndex(x => !x.warm);
      ex.sets.splice(at < 0 ? 0 : at, 0, { w, r: null, warm: true });
      save(); rerenderKeepScroll(); toast('Aufwärmsatz hinzugefügt – zählt nicht in den Vergleich'); break;
    }
    case 'del-warm': {
      const x = ex.sets[+b.dataset.set];
      if (x && x.r != null && !confirm('Aufwärmsatz mit Werten entfernen?')) return;
      ex.sets.splice(+b.dataset.set, 1); save(); rerenderKeepScroll(); break;
    }
    case 'note': editingNote = b.dataset.key; rerenderKeepScroll(); { const el = $app.querySelector('.note-input'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } break;
    case 'swap': {
      const plan = activePlan(), name = b.dataset.name, e = plan && plan.exercises.find(x => x.id === b.dataset.ex);
      if (!e) return;
      if (!confirm(`„${e.name}“ im Plan durch „${name}“ ersetzen?\n\nSätze, Pause und Supersatz bleiben gleich. „${name}“ startet mit einem eigenen Verlauf – deine bisherigen Einträge bleiben im Fortschritt unter „Weitere Übungen“ erhalten.`)) return;
      const old = L.swapExercise(plan, e.id, name); save(); rerenderKeepScroll(); toast(`${old} → ${name}`); break;
    }
    case 'ci-feel': case 'ci-pump': case 'ci-done': case 'ci-skip': case 'ci-edit': case 'ci-painon': case 'ci-pain': case 'ci-set': {
      const rs = resultSession(); if (!rs) return;
      if (act === 'ci-edit') { editingCheckin = rs.id; if (rs.checkin && rs.checkin.skipped) rs.checkin = {}; rerenderKeepScroll(); return; }
      if (act === 'ci-skip') { rs.checkin = { skipped: true }; editingCheckin = null; save(); rerenderKeepScroll(); return; }
      rs.checkin = Object.assign({ pump: [] }, rs.checkin);
      delete rs.checkin.skipped;
      if (act === 'ci-feel') rs.checkin.feel = rs.checkin.feel === b.dataset.v ? undefined : b.dataset.v;
      if (act === 'ci-pump') { const m = b.dataset.m; rs.checkin.pump = rs.checkin.pump.includes(m) ? rs.checkin.pump.filter(x => x !== m) : rs.checkin.pump.concat(m); }
      if (act === 'ci-painon') { rs.checkin.painOn = b.dataset.v === 'yes'; if (!rs.checkin.painOn) rs.checkin.pain = []; }
      if (act === 'ci-pain') { const a = b.dataset.a, cur = rs.checkin.pain || []; rs.checkin.pain = cur.includes(a) ? cur.filter(x => x !== a) : cur.concat(a); }
      if (act === 'ci-set') {
        const k = b.dataset.k, v = b.dataset.v;
        if (k === 'ate') rs.checkin.ate = rs.checkin.ate === (v === 'yes') ? undefined : v === 'yes';
        else rs.checkin[k] = rs.checkin[k] === v ? undefined : v;
      }
      if (act === 'ci-done') {
        if (!rs.checkin.time) rs.checkin.time = L.timeOfDay(rs.startedAt || rs.createdAt);
        rs.checkin.done = true; editingCheckin = null; toast('Danke! Der Coach merkt sich das.');
      }
      save(); rerenderKeepScroll(); return;
    }
    case 'feel': {
      const v = b.dataset.v; ex.feel = ex.feel === v ? undefined : v; save(); refreshFeel(s, +b.dataset.ex);
      if (ex.feel) toast(`${ex.name}: ${FEEL_UI[v][1]}`);
      break;
    }
    case 'max-start': {
      let t = (db.maxTests || []).find(x => x.status === 'active');
      if (!t) { const plan = activePlan(); if (!plan) return; t = L.newMaxTest(plan, todayISO()); db.maxTests = db.maxTests || []; db.maxTests.push(t); save(); }
      location.hash = `#/maxkraft/test/${t.id}`; break;
    }
    case 'max-every': db.settings = Object.assign({}, db.settings, { maxTestEvery: Math.min(16, Math.max(2, Math.round((db.settings?.maxTestEvery || 28) / 7) + +b.dataset.d)) * 7 }); save(); rerenderKeepScroll(); break;
    case 'mx-warm': {
      const ex = currentTest().exercises[+b.dataset.mx], k = +b.dataset.k;
      ex.warmDone = ex.warmDone.includes(k) ? ex.warmDone.filter(x => x !== k) : ex.warmDone.concat(k);
      save(); rerenderKeepScroll(); break;
    }
    case 'mx-skip': currentTest().exercises[+b.dataset.mx].skipped = true; save(); rerenderKeepScroll(); break;
    case 'mx-unskip': currentTest().exercises[+b.dataset.mx].skipped = false; save(); rerenderKeepScroll(); break;
    case 'mx-more': {
      // Nach einem Fehlversuch doch noch einmal probieren: letzten Versuch als nicht gezählt markieren ist nicht nötig – einfach neue Zeile
      const ex = currentTest().exercises[+b.dataset.mx], last = ex.attempts[ex.attempts.length - 1];
      ex.attempts.push({ w: last ? last.w : null, r: null }); save(); rerenderKeepScroll(); break;
    }
    case 'mx-finish': {
      const t = currentTest();
      if (!t.exercises.some(e => e.attempts.some(isValidSet))) { toast('Trage mindestens einen Versuch ein.'); return; }
      const open = t.exercises.filter(e => !e.skipped && !e.attempts.some(isValidSet));
      if (open.length && !confirm(`${open.length} Übung(en) ohne Versuch werden als übersprungen gespeichert. Test abschließen?`)) return;
      open.forEach(e => { e.skipped = true; });
      t.exercises.forEach(e => { e.attempts = e.attempts.filter(isValidSet); });
      t.status = 'done'; t.finishedAt = Date.now(); delete t.rest; save(); Rest.stop();
      location.hash = '#/maxkraft'; toast('Test gespeichert 💪'); break;
    }
    case 'mx-discard': {
      const t = currentTest();
      if (!confirm(t.status === 'active' ? 'Laufenden Test verwerfen?' : 'Diesen Test endgültig löschen?')) return;
      db.maxTests = db.maxTests.filter(x => x !== t); delete t.rest; save(); Rest.stop(); location.hash = '#/maxkraft'; break;
    }
    case 'goal': db.settings = Object.assign({}, db.settings, { weeklyGoal: Math.min(7, Math.max(1, (db.settings?.weeklyGoal || 3) + +b.dataset.d)) }); save(); rerenderKeepScroll(); break;
    case 'unskip': ex.skipped = false; save(); rerenderKeepScroll(); break;
    case 'finish': {
      if (!s.exercises.some(e => validSets(e).length)) { toast('Trage mindestens einen Satz ein.'); return; }
      const empty = s.exercises.filter(e => !e.skipped && !validSets(e).length);
      if (empty.length && !confirm(`${empty.length} Übung(en) ohne Werte werden als übersprungen gespeichert. Training abschließen?`)) return;
      empty.forEach(e => { e.skipped = true; });
      s.status = 'done'; s.finishedAt = Date.now(); delete s.rest; save(); Rest.stop();
      location.hash = `#/ergebnis/${s.id}`; break;
    }
    case 'show-result': location.hash = `#/ergebnis/${s.id}`; break;
    case 'discard': case 'delete-session':
      if (!confirm(act === 'discard' ? 'Laufendes Training verwerfen? Alle Eingaben gehen verloren.' : 'Dieses Training endgültig löschen?')) return;
      db.sessions = db.sessions.filter(x => x.id !== s.id); save(); location.hash = act === 'discard' ? '#/' : '#/trainings'; break;
    case 'chart-mode': chartMode[b.dataset.key] = b.dataset.m === '1rm' ? '1rm' : parseFloat(b.dataset.m); rerenderKeepScroll(); break;
    case 'period': outlookDays = +b.dataset.d; try { localStorage.setItem('trainingsapp.ausblick', outlookDays); } catch (e) { /* egal */ } rerenderKeepScroll(); break;
    case 'activate': db.activePlanId = b.dataset.plan; save(); rerenderKeepScroll(); toast('Aktiver Plan gewählt'); break;
    case 'new-plan': {
      const name = prompt('Name des neuen Plans:', 'Neuer Plan');
      if (name === null) return;
      const np = { id: L.uid(), name: name.trim() || 'Neuer Plan', exercises: [] };
      db.plans.push(np); if (!db.activePlanId) db.activePlanId = np.id; save(); location.hash = `#/plan/${np.id}`; break;
    }
    case 'move-block': moveBlock(p, +b.dataset.idx, +b.dataset.d); save(); rerenderKeepScroll(); break;
    case 'move-in': {
      const i = +b.dataset.idx, j = i + +b.dataset.d;
      if (p.exercises[j] && p.exercises[j].group === p.exercises[i].group) { [p.exercises[i], p.exercises[j]] = [p.exercises[j], p.exercises[i]]; save(); rerenderKeepScroll(); }
      break;
    }
    case 'link': {
      const i = +b.dataset.idx, next = p.exercises[i + 1];
      if (!next) return;
      p.exercises[i].group = next.group || ('neu-' + L.uid());
      if (!next.group) next.group = p.exercises[i].group;
      normalizeGroups(p); L.unifyGroupRest(p.exercises); save(); rerenderKeepScroll(); toast(`Supersatz ${p.exercises[i].group} gebildet`); break;
    }
    case 'unlink': p.exercises.forEach(e => { if (e.group === b.dataset.group) e.group = null; }); normalizeGroups(p); save(); rerenderKeepScroll(); toast('Supersatz aufgelöst'); break;
    case 'add-ex': { const e = L.mkPlanEx('Neue Übung', 3, null); p.exercises.push(e); save(); location.hash = `#/plan/${p.id}/uebung/${e.id}`; break; }
    case 'del-ex':
      if (!confirm('Übung aus dem Plan entfernen? Bisherige Trainingseinträge bleiben erhalten.')) return;
      p.exercises = p.exercises.filter(e => e.id !== location.hash.split('/').pop()); normalizeGroups(p); save(); location.hash = `#/plan/${p.id}`; break;
    case 'dup-plan': {
      const c = JSON.parse(JSON.stringify(p)); c.id = L.uid(); c.name = p.name + ' (Kopie)';
      c.exercises.forEach(e => { e.id = L.uid(); });
      db.plans.push(c); save(); location.hash = `#/plan/${c.id}`; toast('Plan dupliziert'); break;
    }
    case 'del-plan':
      if (!confirm(`Plan „${p.name}“ löschen? Bisherige Trainings bleiben erhalten.`)) return;
      db.plans = db.plans.filter(x => x.id !== p.id);
      if (db.activePlanId === p.id) db.activePlanId = db.plans[0] ? db.plans[0].id : null;
      save(); location.hash = '#/plaene'; break;
    case 'export': exportData(); break;
  }
});

/* ---------------- Sicherung ---------------- */
async function exportData() {
  db.lastExport = Date.now(); save();
  const payload = JSON.stringify({ app: 'trainingsapp', version: db.version, exportedAt: new Date().toISOString(), data: db }, null, 1);
  const name = `training-sicherung-${todayISO()}.json`;
  const file = new File([payload], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Trainings-Sicherung' }); render(); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Sicherung erstellt'); render();
}
function importFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    let d;
    try { const obj = JSON.parse(r.result); d = L.migrate(obj.data || obj); }
    catch (e) { alert('Die Datei ist keine gültige Sicherung.'); return; }
    const n = d.sessions.filter(s => s.status === 'done' && s.kind !== 'baseline').length;
    if (!confirm(`Sicherung mit ${d.plans.length} Plänen und ${n} Trainings importieren? Die aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
    db = d; L.setDb(db); save(); toast('Sicherung importiert'); render();
  };
  r.readAsText(file);
}

/* ---------------- Start ---------------- */
{ const m = location.hash.match(/^#\/training\/([^/]+)$/); cleanupEmptySessions(m ? m[1] : null); }
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Neue Version: Sobald der neue Service Worker übernimmt, einmal neu laden
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
}
