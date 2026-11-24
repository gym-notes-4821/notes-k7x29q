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
const untouched = s => s.status === 'active' && s.exercises.every(e => !e.skipped && e.sets.every(x => x.w == null && x.r == null));
const sessionLabel = s => s.kind === 'baseline' ? 'Startwerte' : `${esc(s.planName)}${s.unitName ? ' · ' + esc(s.unitName) : ''}`;

/* ---------------- Gemeinsame Bausteine ---------------- */
function topbar(title, back = '#/', home = false) {
  return `<header class="topbar"><a class="back" href="${back}">‹ Zurück</a><h1>${esc(title)}</h1>
    ${home ? '<a class="home" href="#/" aria-label="Startseite">⌂</a>' : '<span class="home-ph"></span>'}</header>`;
}
const STATUS = {
  up: { label: 'Stärker', icon: '▲' },
  same: { label: 'Stagnation', icon: '=' },
  down: { label: 'Schwächer', icon: '▼' },
  none: { label: 'Kein Vergleich', icon: '○' },
  skipped: { label: 'Übersprungen', icon: '–' },
  fup: { label: 'Steigend', icon: '▲' },
  fflat: { label: 'Kein Anstieg', icon: '=' },
  ffew: { label: 'Zu wenig Daten', icon: '○' },
};
const CLS = { up: 'up', same: 'same', down: 'down', none: 'grey', skipped: 'grey', fup: 'up', fflat: 'same', ffew: 'grey' };
function statusRow({ st, name, text, meta, href, perDumbbell }) {
  return `<a class="prow s-${CLS[st]}" href="${href}">
    <div class="prow-top"><span class="pname">${esc(name)}${perDumbbell ? ' <span class="pd">pro Hantel</span>' : ''}</span>
    <span class="st">${STATUS[st].icon} ${STATUS[st].label}</span></div>
    <div class="ptext">${esc(text)}</div>${meta ? `<div class="pmeta">${meta}</div>` : ''}</a>`;
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
function lineChart({ points, forecast = null, unit = '', timeScale = false, zero = false }) {
  if (!points.length) return '<p class="empty small">Noch keine Daten für die Grafik.</p>';
  if (timeScale) { const m = new Map(); points.forEach(p => m.set(p.d, p)); points = [...m.values()]; }
  const W = 340, H = 200, Lp = 42, R = 16, T = 22, B = 28;
  const ys = points.map(p => p.y).concat(forecast ? [forecast.y] : []).concat(zero ? [0] : []);
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
  const dots = points.map((p, i) => `<circle cx="${xs[i]}" cy="${Y(p.y)}" r="4.5" class="dot"/>
    ${valIdx.has(i) ? `<text x="${xs[i]}" y="${Y(p.y) - 9}" class="val" text-anchor="middle">${fy(p.y)}</text>` : ''}
    ${dateIdx.has(i) && endX - xs[i] >= 44 || (!forecast && dateIdx.has(i)) ? `<text x="${xs[i]}" y="${H - 8}" class="axis" text-anchor="middle">${fmtDate(p.d, 'tiny')}</text>` : ''}`).join('');
  let fc = '';
  if (forecast) {
    const lx = X(xsRaw[xsRaw.length - 1]), ly = Y(points[points.length - 1].y);
    fc = `<line x1="${lx}" y1="${ly}" x2="${X(xEnd)}" y2="${Y(forecast.y)}" class="fline"/>
      <circle cx="${X(xEnd)}" cy="${Y(forecast.y)}" r="4.5" class="fdot"/>
      <text x="${X(xEnd)}" y="${Y(forecast.y) - 9}" class="val" text-anchor="end">${fy(forecast.y)}</text>
      <text x="${X(xEnd)}" y="${H - 8}" class="axis" text-anchor="end">${fmtDate(forecast.d, 'tiny')}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlaufsgrafik">${g}<polyline points="${line}" class="pline"/>${fc}${dots}</svg>`;
}

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
  [/^#\/ausblick\/uebung\/([^/]+)$/, key => viewExercise(key, true)],
];
let lastHash = location.hash;
function cleanupEmptySessions(keepId) {
  const before = db.sessions.length;
  db.sessions = db.sessions.filter(s => s.id === keepId || !untouched(s));
  if (db.sessions.length !== before) save();
}
function render() {
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { $app.innerHTML = fn(...m.slice(1).map(x => x && decodeURIComponent(x))); return; }
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
    <p class="active-plan">Aktiver Plan: <b>${plan ? esc(plan.name) : 'keiner'}</b></p>
    <div class="tiles">
      <a class="tile" href="#/plaene"><span class="ic">☰</span><span class="tl">Trainingspläne</span></a>
      <a class="tile tile-main" href="#/training"><span class="ic">▶</span><span class="tl">Training</span>${run ? '<span class="hint">Weitermachen</span>' : ''}</a>
      <a class="tile" href="#/fortschritt"><span class="ic">▲</span><span class="tl">Fortschritt</span></a>
      <a class="tile" href="#/ausblick"><span class="ic">↗</span><span class="tl">Ausblick</span></a>
    </div></div>`;
}

/* ---------------- Training ---------------- */
function viewTrainingEntry() {
  let s = activeSession();
  if (!s) {
    const plan = activePlan();
    if (!plan) { setTimeout(() => location.replace('#/plaene'), 0); return ''; }
    s = L.newSession(plan, todayISO());
    db.sessions.push(s); save();
  }
  setTimeout(() => location.replace(`#/training/${s.id}`), 0);
  return '';
}
function lastLine(s, ex) {
  const prev = previousEntry(ex.key, s);
  if (prev) return `<p class="last">Letztes Mal (${prev.session.kind === 'baseline' ? 'Startwerte, ' : ''}${fmtDate(prev.session.date, 'tiny')}): <b>${fmtSets(prev.sets)}</b></p>`;
  if (ex.guide != null) return `<p class="last">Noch kein Eintrag · Orientierung <b>${fmtNum(ex.guide)} kg</b></p>`;
  return '<p class="last">Noch kein Eintrag</p>';
}
function inputs(i, j, set) {
  return `<input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" data-f="w" data-ex="${i}" data-set="${j}" value="${fmtNum(set.w)}" placeholder="kg" aria-label="Satz ${j + 1} Gewicht in kg">
    <span class="x">×</span>
    <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" data-f="r" data-ex="${i}" data-set="${j}" value="${set.r ?? ''}" placeholder="Wdh." aria-label="Satz ${j + 1} Wiederholungen">`;
}
function singleCard(s, ex, i) {
  const head = `<div class="ex-head"><h3>${esc(ex.name)}</h3>${ex.perDumbbell ? '<span class="pd">pro Hantel</span>' : ''}</div>`;
  if (ex.skipped) return `<section class="ex-card skipped">${head}<p class="last">Übersprungen – zählt nicht als schwächer.</p>
    <div class="ex-actions"><button data-act="unskip" data-ex="${i}">Doch trainieren</button></div></section>`;
  const hasPrev = !!previousEntry(ex.key, s);
  return `<section class="ex-card" data-card="${i}">${head}${lastLine(s, ex)}
    <div class="sets"><div class="set-head"><span></span><span>kg${ex.perDumbbell ? ' / Hantel' : ''}</span><span></span><span>Wdh.</span></div>
    ${ex.sets.map((set, j) => `<div class="set-row ${isValidSet(set) ? 'complete' : ''}"><span class="no">${j + 1}</span>${inputs(i, j, set)}</div>`).join('')}</div>
    <div class="ex-actions"><button class="btn-take" data-act="take-all" data-ex="${i}" ${hasPrev ? '' : 'disabled'}>Wie letztes Mal</button>
    <button data-act="skip" data-ex="${i}">Überspringen</button></div></section>`;
}
function supersetCard(s, b) {
  const items = b.items;
  const rounds = Math.max(...items.map(it => it.ex.sets.length));
  const prevs = items.map(it => previousEntry(it.ex.key, s));
  let h = `<section class="ex-card superset"><div class="ss-head"><h3>Supersatz ${esc(b.group)}</h3><span class="muted small">${rounds} Runden · ohne Pause</span></div>
    <ol class="ss-list">${items.map((it, k) => `<li class="${it.ex.skipped ? 'skipped' : ''}"><div class="ss-li-top"><b>${esc(it.ex.name)}</b>${it.ex.perDumbbell ? '<span class="pd">pro Hantel</span>' : ''}
      ${it.ex.skipped ? `<button class="btn-small" data-act="unskip" data-ex="${it.idx}">Doch trainieren</button>` : `<button class="btn-small" data-act="skip" data-ex="${it.idx}">Überspringen</button>`}</div>
      ${it.ex.skipped ? '<p class="last">Übersprungen – zählt nicht als schwächer.</p>' : lastLine(s, it.ex)}</li>`).join('')}</ol>`;
  for (let r = 0; r < rounds; r++) {
    h += `<div class="round"><div class="round-title">Runde ${r + 1}</div>`;
    items.forEach((it, k) => {
      const ex = it.ex, set = ex.sets[r];
      if (ex.skipped || !set) return;
      const p = prevs[k] && prevs[k].ex.sets[r];
      const prevCell = p && isValidSet(p)
        ? `<button class="prev-btn" data-act="take" data-ex="${it.idx}" data-set="${r}" data-w="${p.w}" data-r="${p.r}" aria-label="Wert vom letzten Mal übernehmen">${fmtNum(p.w)} × ${p.r}<small>zuletzt</small></button>`
        : '<span class="prev-empty">–</span>';
      h += `<div class="ss-row"><div class="ss-name">${esc(ex.name)}</div>
        <div class="set-row ss ${isValidSet(set) ? 'complete' : ''}">${inputs(it.idx, r, set)}${prevCell}</div></div>`;
    });
    h += '</div>';
  }
  const anyPrev = prevs.some(Boolean);
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
    <div class="progress"><div style="width:${Math.round(done / Math.max(1, s.exercises.length) * 100)}%"></div></div></div>`;
  for (const b of blocks(s.exercises)) h += b.group ? supersetCard(s, b) : singleCard(s, b.items[0].ex, b.items[0].idx);
  h += '<div class="wk-footer stack">';
  if (s.status === 'active') h += `<button class="btn-primary btn-block btn-big" data-act="finish">Training abschließen</button>
      <button class="btn-danger btn-block" data-act="discard">Training verwerfen</button>`;
  else h += `<button class="btn-primary btn-block btn-big" data-act="show-result">Fertig – Auswertung ansehen</button>
      <button class="btn-danger btn-block" data-act="delete-session">Training löschen</button>`;
  return h + '</div>';
}

/* ---------------- Auswertung eines Trainings ---------------- */
function counts(list) {
  const c = st => list.filter(x => x === st).length;
  return `<div class="counts"><div class="s-up"><b>▲ ${c('up')}</b>stärker</div><div class="s-same"><b>= ${c('same')}</b>gleich</div>
    <div class="s-down"><b>▼ ${c('down')}</b>schwächer</div><div class="s-grey"><b>○ ${c('none') + c('skipped')}</b>ohne Vgl.</div></div>`;
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
  let h = topbar(s.kind === 'baseline' ? 'Startwerte' : 'Auswertung', '#/') +
    `<p class="muted">${fmtDate(s.date, 'long')} · ${sessionLabel(s)}</p>${counts(res.map(a => a.status))}`;
  if (s.status === 'active') h += `<p class="card small">Dieses Training läuft noch. <a href="#/training/${s.id}">Weiter eintragen</a></p>`;
  h += groupedList(s.exercises, (ex, i) => statusRow({ st: res[i].status, name: ex.name, text: res[i].text, meta: metaFor(res[i]),
    href: `#/fortschritt/uebung/${encodeURIComponent(ex.key)}`, perDumbbell: ex.perDumbbell }));
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

/* ---------------- Fortschritt ---------------- */
function otherExercises(plan) {
  const inPlan = new Set(plan.exercises.map(e => normKey(e.name)));
  const map = new Map();
  for (const s of doneSessions()) for (const ex of s.exercises)
    if (!inPlan.has(ex.key) && validSets(ex).length) map.set(ex.key, ex.name);
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
  h += groupedList(plan.exercises, ex => {
    const key = normKey(ex.name), a = latestProgress(key);
    return statusRow({ st: a.status, name: ex.name, text: a.text, meta: metaFor(a), href: `#/fortschritt/uebung/${encodeURIComponent(key)}`, perDumbbell: ex.perDumbbell });
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
const outlookNote = '<p class="note">Grobe Schätzung bei gleichbleibendem Tempo. Fortschritt verlangsamt sich mit der Zeit meist.</p>';
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
    ${lineChart({ points: pts, forecast: pf.pct == null || pf.endY == null ? null : { d: addDaysISO(lastD, outlookDays), y: pf.endY }, unit: '%', timeScale: true, zero: true })}
    <p class="chart-note">Kraft gegenüber Startwerten · durchgezogen: bisher · gestrichelt: Prognose</p></div>`;
  h += groupedList(plan.exercises, ex => {
    const x = pf.per.find(p => p.e === ex), f = x.f;
    const st = f.status === 'few' ? 'ffew' : f.status === 'flat' ? 'fflat' : 'fup';
    let meta = '';
    if (f.status !== 'few') meta = esc(`Trend ${fmtPct(f.weeklyPct)} pro Woche${f.capped ? ` – gedeckelt auf ${fmtPct(L.MAX_WEEKLY * 100)}` : ''} · Basis: ${f.n} Trainings`);
    const text = f.status === 'few' ? f.text : forecastText(ex.name, f, outlookDays).replace(`${ex.name}: `, '');
    return statusRow({ st, name: ex.name, text, meta, href: `#/ausblick/uebung/${encodeURIComponent(x.key)}`, perDumbbell: ex.perDumbbell });
  });
  return h;
}

/* ---------------- Übungsdetail ---------------- */
const chartMode = {};
function viewExercise(key, outlook) {
  const back = outlook ? '#/ausblick' : '#/fortschritt';
  const hist = exerciseHistory(key);
  const all = doneSessions().map(s => ({ s, ex: s.exercises.find(e => e.key === key) })).filter(x => x.ex);
  const name = all.length ? all[all.length - 1].ex.name : key;
  const planEx = (activePlan()?.exercises || []).find(e => normKey(e.name) === key);
  const perDumbbell = planEx ? planEx.perDumbbell : (all.length && all[all.length - 1].ex.perDumbbell);
  let h = topbar(name, back, true);
  if (perDumbbell) h += '<p class="muted small">Gewichte pro Hantel</p>';
  if (!hist.length) return h + '<p class="empty">Noch keine Einträge für diese Übung.</p>';
  if (outlook) {
    const f = forecastFor(key, outlookDays, perDumbbell);
    h += periodSeg() + outlookNote;
    const pts = hist.map(e => ({ d: e.session.date, y: bestE1(e.sets) }));
    h += `<div class="chart-wrap"><div class="chart-title"><span>Geschätztes Maximalgewicht (kg)</span></div>
      ${lineChart({ points: pts, timeScale: true, unit: 'kg', forecast: f.status === 'few' ? null : { d: addDaysISO(f.lastDate, outlookDays), y: f.eF } })}
      <p class="chart-note">durchgezogen: bisher · gestrichelt: Prognose</p></div>
      <div class="card"><b>${esc(forecastText(name, f, outlookDays))}</b>
      ${f.status !== 'few' ? `<p class="muted small">Trend der letzten ${f.n} Trainings: ${fmtPct(f.weeklyPct)} pro Woche${f.capped ? `, gedeckelt auf ${fmtPct(L.MAX_WEEKLY * 100)}` : ''}${f.status === 'flat' ? ' – aktuell kein Anstieg, daher keine sinkende Prognose' : ''}. Gerundet auf ${perDumbbell ? '1 kg' : '2,5 kg'}.</p>` : ''}</div>`;
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
    h += `<tr><td><a href="#/ergebnis/${s.id}">${fmtDate(s.date)}</a>${s.kind === 'baseline' ? '<br><span class="tag">Startwerte</span>' : ''}</td>
      <td>${ex.skipped ? '<span class="muted">übersprungen</span>' : validSets(ex).map(x => `${fmtNum(x.w)} × ${x.r}`).join('<br>')}</td>
      <td><span class="st-mini s-${CLS[a.status]}">${STATUS[a.status].icon} ${STATUS[a.status].label}</span></td></tr>`;
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
      <a class="btn btn-ghost btn-small" href="#/plan/${p.id}">Bearbeiten</a></div>`;
  }
  h += `<button class="btn-ghost btn-block" data-act="new-plan">+ Neuer Plan</button>
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
    <button class="btn-icon" data-act="${inGroup ? 'move-in' : 'move-block'}" data-idx="${idx}" data-d="-1" ${first ? 'disabled' : ''} aria-label="nach oben">↑</button>
    <button class="btn-icon" data-act="${inGroup ? 'move-in' : 'move-block'}" data-idx="${idx}" data-d="1" ${last ? 'disabled' : ''} aria-label="nach unten">↓</button>
    ${!inGroup ? `<button class="btn-icon" data-act="link" data-idx="${idx}" ${canLink ? '' : 'disabled'} aria-label="Mit nächster Übung als Supersatz verbinden" title="Mit nächster Übung als Supersatz verbinden">⛓</button>` : ''}</div>`;
}
function viewPlanEdit(id) {
  const p = getPlan(id);
  if (!p) return topbar('Plan', '#/plaene', true) + '<p class="empty">Plan nicht gefunden.</p>';
  const bl = blocks(p.exercises);
  let h = topbar('Plan bearbeiten', '#/plaene', true) + `<label class="field"><span>Name</span><input data-plan-f="name" value="${esc(p.name)}"></label>
    <h2>Übungen</h2><p class="muted small">↑↓ ändert die Reihenfolge · ⛓ verbindet eine Übung mit der nächsten zu einem Supersatz.</p><div class="card">`;
  bl.forEach((b, bi) => {
    if (b.group) {
      h += `<div class="plan-group"><div class="plan-group-head"><b class="spacer">Supersatz ${esc(b.group)}</b>
        <button class="btn-icon" data-act="move-block" data-idx="${b.items[0].idx}" data-d="-1" ${bi === 0 ? 'disabled' : ''} aria-label="Supersatz nach oben">↑</button>
        <button class="btn-icon" data-act="move-block" data-idx="${b.items[0].idx}" data-d="1" ${bi === bl.length - 1 ? 'disabled' : ''} aria-label="Supersatz nach unten">↓</button>
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
    <label class="check"><input type="checkbox" data-slot="perDumbbell" ${e.perDumbbell ? 'checked' : ''}> Kurzhantel – Gewicht pro Hantel</label>
    <label class="field" style="margin-top:8px"><span>Supersatz</span><select data-slot="group">
      <option value="">Kein Supersatz (Einzelübung)</option>
      ${groups.map(g => `<option value="${esc(g)}" ${e.group === g ? 'selected' : ''}>Supersatz ${esc(g)}</option>`).join('')}</select></label>
    <p class="muted small">Der Verlauf hängt am Namen der Übung. Ein neuer Name beginnt einen neuen Verlauf.</p>
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
  prev.ex.sets.forEach((p, j) => {
    if (!isValidSet(p)) return;
    if (!ex.sets[j]) ex.sets[j] = { w: null, r: null };
    ex.sets[j].w = p.w; ex.sets[j].r = p.r;
  });
}

$app.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.f) {
    const s = currentSession(); if (!s) return;
    const i = +t.dataset.ex, j = +t.dataset.set, set = s.exercises[i].sets[j];
    const v = t.dataset.f === 'w' ? parseNum(t.value) : parseInt0(t.value);
    t.classList.toggle('invalid', Number.isNaN(v));
    set[t.dataset.f] = Number.isNaN(v) ? null : v;
    save(); markRow(i, j);
    // Kurzer Weg: nach vollständiger Wiederholungszahl ins nächste Feld springen
    if (t.dataset.f === 'r' && v != null && !Number.isNaN(v) && (t.value.length >= 2 || v >= 4)) focusNext(t);
    return;
  }
  const p = currentPlan(); if (!p) return;
  if (t.dataset.planF === 'name') { if (t.value.trim()) { p.name = t.value.trim(); save(); } }
  else if (t.dataset.slot) {
    const e = currentSlot(p), f = t.dataset.slot;
    if (f === 'name') { if (t.value.trim()) e.name = t.value.trim(); }
    else if (f === 'guide') { const v = parseNum(t.value); t.classList.toggle('invalid', Number.isNaN(v)); if (!Number.isNaN(v)) e.guide = v; }
    else if (f === 'sets') { const v = parseInt0(t.value); const ok = v != null && !Number.isNaN(v) && v > 0 && v <= 20; t.classList.toggle('invalid', !ok); if (ok) e.sets = v; }
    else return;
    save();
  }
});

$app.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.act === 'date') { const s = currentSession(); if (t.value) { s.date = t.value > todayISO() ? todayISO() : t.value; save(); rerenderKeepScroll(); toast('Datum geändert'); } return; }
  if (t.dataset.f === 'w') {
    // Gewicht für die folgenden leeren Sätze derselben Übung vorschlagen
    const s = currentSession(), i = +t.dataset.ex, ex = s.exercises[i], w = ex.sets[+t.dataset.set].w;
    if (w == null) return;
    for (let j = +t.dataset.set + 1; j < ex.sets.length; j++)
      if (ex.sets[j].w == null && ex.sets[j].r == null) { ex.sets[j].w = w; setInput(i, j, 'w', w); }
    save(); return;
  }
  if (t.dataset.act === 'import') { importFile(t.files[0]); t.value = ''; return; }
  const p = currentPlan(); if (!p) return;
  if (t.dataset.slot === 'perDumbbell') { currentSlot(p).perDumbbell = t.checked; save(); }
  if (t.dataset.slot === 'group') { const e = currentSlot(p); e.group = t.value || null; normalizeGroups(p); save(); toast(e.group ? `Zu Supersatz ${e.group} hinzugefügt` : 'Aus Supersatz entfernt'); rerenderKeepScroll(); }
});

$app.addEventListener('keydown', ev => {
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
      set.w = parseFloat(b.dataset.w); set.r = parseInt(b.dataset.r, 10);
      setInput(i, j, 'w', set.w); setInput(i, j, 'r', set.r); save(); markRow(i, j); break;
    }
    case 'take-all': fillFromPrev(s, +b.dataset.ex); save(); rerenderKeepScroll(); toast('Werte vom letzten Mal übernommen'); break;
    case 'take-group': s.exercises.forEach((e, i) => { if (e.group === b.dataset.group) fillFromPrev(s, i); }); save(); rerenderKeepScroll(); toast('Supersatz vorbefüllt'); break;
    case 'skip': ex.skipped = true; save(); rerenderKeepScroll(); break;
    case 'unskip': ex.skipped = false; save(); rerenderKeepScroll(); break;
    case 'finish': {
      if (!s.exercises.some(e => validSets(e).length)) { toast('Trage mindestens einen Satz ein.'); return; }
      const empty = s.exercises.filter(e => !e.skipped && !validSets(e).length);
      if (empty.length && !confirm(`${empty.length} Übung(en) ohne Werte werden als übersprungen gespeichert. Training abschließen?`)) return;
      empty.forEach(e => { e.skipped = true; });
      s.status = 'done'; s.finishedAt = Date.now(); save();
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
      normalizeGroups(p); save(); rerenderKeepScroll(); toast(`Supersatz ${p.exercises[i].group} gebildet`); break;
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
