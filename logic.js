/* Trainingsapp – reine Logik (ohne DOM). Läuft im Browser (window.Logic) und in Node (require). */
(function (root) {
'use strict';

/* ---------------- Hilfsfunktionen ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const normKey = name => String(name).trim().toLowerCase().replace(/\s+/g, ' ');
const round2 = n => Math.round(n * 100) / 100;
const round1 = n => Math.round(n * 10) / 10;
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const dayNum = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const addDaysISO = (iso, days) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + days)); };

function parseNum(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return round2(parseFloat(s));
}
function parseInt0(str) {
  const s = String(str ?? '').trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return NaN;
  return parseInt(s, 10);
}
const fmtNum = n => (n == null || Number.isNaN(n)) ? '' : String(round2(n)).replace('.', ',');
const fmtSet = s => `${fmtNum(s.w)} kg × ${s.r}`;
const fmtPct = p => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${fmtNum(round1(Math.abs(p)))} %`;
function fmtDate(iso, style = 'short') {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (style === 'long') return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (style === 'tiny') return `${pad(d)}.${pad(m)}.`;
  return `${pad(d)}.${pad(m)}.${String(y).slice(2)}`;
}
/** "45 kg × 12 / 12 / 10" – aufeinanderfolgende Sätze mit gleichem Gewicht werden zusammengefasst. */
function fmtSets(sets) {
  const out = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.w === s.w) last.r.push(s.r); else out.push({ w: s.w, r: [s.r] });
  }
  return out.map(g => `${fmtNum(g.w)} kg × ${g.r.join(' / ')}`).join(' · ');
}
const WORDS = ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
const repWord = n => n === 1 ? 'eine Wiederholung' : `${n <= 12 ? WORDS[n] : n} Wiederholungen`;
const e1rm = s => s.w * (1 + s.r / 30);

/* ---------------- Standardplan & Startwerte ---------------- */
const START_PLAN_ID = 'plan-ganzkoerper-v2';
// [Name, Gewicht (bei Kurzhanteln pro Hantel), Wiederholungen je Satz (Startwerte), Supersatz, pro Hantel, Sätze im Plan]
const START_VALUES = [
  ['Hackenschmidt', 10, [12, 12, 8], null, false],
  ['Kreuzheben', 42.5, [12, 10], null, false, 3],
  ['Bankdrücken mit Kurzhanteln', 17.5, [12, 12, 8], null, true],
  ['Latziehen', 45, [12, 12, 10], null, false],
  ['Butterfly mit Kurzhanteln', 12.5, [12, 11, 9], null, true],
  ['Rudern aufrecht', 20, [12, 12, 12], null, false],
  ['Schulterdrücken', 7.5, [12, 12, 10], null, true],
  ['Bizepscurls', 12, [13, 13], 'A', true],
  ['Trizeps am Turm 1', 18, [13, 13], 'A', false],
  ['Seitheben', 5, [13, 13], 'A', true],
  ['Hammercurls', 12.5, [13, 12], 'B', true],
  ['Trizeps am Turm 2', 18, [13, 10], 'B', false],
];
function mkPlanEx(name, sets, guide, opts = {}) {
  return { id: opts.id || uid(), name, sets, guide: guide ?? null, perDumbbell: !!opts.perDumbbell, group: opts.group || null };
}
function defaultPlan() {
  return {
    id: START_PLAN_ID, name: 'Ganzkörperplan',
    exercises: START_VALUES.map(([name, w, reps, group, pd, sets], i) => mkPlanEx(name, sets || reps.length, w, { id: `gk-${i + 1}`, group, perDumbbell: pd })),
  };
}
function snapshotEx(pe) {
  return { slotId: pe.id, name: pe.name, key: normKey(pe.name), group: pe.group || null, perDumbbell: !!pe.perDumbbell,
    guide: pe.guide ?? null, targetSets: pe.sets, skipped: false, sets: Array.from({ length: pe.sets }, () => ({ w: null, r: null })) };
}
function newSession(plan, date) {
  return { id: uid(), planId: plan.id, planName: plan.name, date: date || todayISO(), createdAt: Date.now(),
    finishedAt: null, status: 'active', exercises: plan.exercises.map(snapshotEx) };
}
function baselineSession(plan, date) {
  const s = newSession(plan, date);
  s.id = 'startwerte-' + uid(); s.kind = 'baseline'; s.status = 'done'; s.finishedAt = s.createdAt;
  s.exercises.forEach((ex, i) => { const [, w, reps] = START_VALUES[i]; ex.sets = reps.map(r => ({ w, r })); });
  return s;
}
function freshDb() {
  const plan = defaultPlan();
  return { version: DATA_VERSION, plans: [plan], sessions: [baselineSession(plan)], activePlanId: plan.id, lastExport: null };
}

/* ---------------- Migration ---------------- */
const validDb = d => !!d && Array.isArray(d.plans) && Array.isArray(d.sessions);
const DATA_VERSION = 3;
/** Bringt Daten beliebiger älterer Version auf die aktuelle Version. Selbst eingetragene Trainings bleiben unverändert. */
function migrate(input) {
  if (!validDb(input)) throw new Error('Ungültiges Datenformat');
  const d = JSON.parse(JSON.stringify(input));
  if (!d.version || d.version < 2) {
    // Trainings: Varianten werden zu eigenständigen Übungen (Name = gewählte Variante)
    for (const s of d.sessions) {
      s.exercises = (s.exercises || []).map(ex => ({
        slotId: ex.slotId || uid(), name: ex.name || ex.variant || ex.label || 'Übung',
        key: ex.key || normKey(ex.name || ex.variant || ex.label || 'Übung'), group: ex.group || null,
        perDumbbell: !!ex.perDumbbell, guide: ex.guide ?? null, targetSets: ex.targetSets || (ex.sets || []).length,
        skipped: !!ex.skipped, sets: (ex.sets || []).map(x => ({ w: x.w ?? null, r: x.r ?? null })),
      }));
    }
    // Pläne: alter Standardplan wird ersetzt, eigene Pläne ohne Einheiten/Varianten übernommen
    const plans = [];
    for (const p of d.plans) {
      if (p.id === 'plan-ganzkoerper') continue;
      const exercises = [];
      for (const e of p.exercises || []) {
        const names = (e.variants && e.variants.length > 1) ? e.variants : [e.name];
        for (const n of names) exercises.push(mkPlanEx(n, e.sets || 3, e.guide ?? null, { perDumbbell: e.perDumbbell }));
      }
      plans.push({ id: p.id, name: p.name, exercises });
    }
    const plan = defaultPlan();
    plans.unshift(plan);
    d.plans = plans;
    if (!d.sessions.some(s => s.kind === 'baseline' && s.planId === plan.id)) d.sessions.push(baselineSession(plan));
    d.activePlanId = plan.id;
    d.version = 2;
  }
  if (d.version < 3) {
    // Version 3: Kurzhantelgewichte des Standardplans pro Hantel statt beide Hanteln zusammen,
    // Kreuzheben mit 3 statt 2 Sätzen. Betrifft Plan, Startwerte und vorausgefüllte, noch leere Sätze.
    const HALF = { 'bankdrücken mit kurzhanteln': [35, 17.5], 'butterfly mit kurzhanteln': [25, 12.5], 'schulterdrücken': [15, 7.5] };
    const fix = (key, w) => (HALF[key] && w === HALF[key][0]) ? HALF[key][1] : w;
    const plan = d.plans.find(p => p.id === START_PLAN_ID);
    if (plan) for (const e of plan.exercises) {
      const k = normKey(e.name);
      e.guide = fix(k, e.guide);
      if (k === 'kreuzheben' && e.sets === 2) e.sets = 3;
    }
    for (const s of d.sessions) {
      if (s.planId !== START_PLAN_ID) continue;
      if (s.kind === 'baseline') {
        for (const ex of s.exercises) { ex.guide = fix(ex.key, ex.guide); ex.sets.forEach(x => { x.w = fix(ex.key, x.w); }); }
      } else if (s.status === 'active') {
        const wasUntouched = s.prefill && isUntouched(s);
        for (const ex of s.exercises) {
          ex.guide = fix(ex.key, ex.guide);
          ex.sets.forEach(x => { if (x.r == null) x.w = fix(ex.key, x.w); });
          if (ex.key === 'kreuzheben' && ex.sets.length === 2) {
            ex.sets.push({ w: ex.sets[1].w, r: null }); ex.targetSets = 3;
          }
        }
        if (wasUntouched) s.prefill = weightSignature(s);
      }
    }
    d.version = 3;
  }
  if (!d.plans.some(p => p.id === d.activePlanId)) d.activePlanId = d.plans[0] ? d.plans[0].id : null;
  return d;
}

/* ---------------- Datenzugriff ---------------- */
let db = null;
const setDb = d => { db = d; };
const getDb = () => db;
const sessionOrder = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt - b.createdAt);
const doneSessions = () => db.sessions.filter(s => s.status === 'done').sort(sessionOrder);
const isValidSet = s => s.w != null && s.r != null && s.r > 0 && !Number.isNaN(s.w);
const validSets = ex => (!ex || ex.skipped) ? [] : ex.sets.filter(isValidSet);
const bestE1 = sets => Math.max(...sets.map(e1rm));
const bestSetByE1 = sets => sets.reduce((a, b) => e1rm(b) > e1rm(a) ? b : a);

/** Alle abgeschlossenen Einträge einer Übung (über alle Pläne), chronologisch, nur mit gültigen Sätzen. */
function exerciseHistory(key) {
  const out = [];
  for (const s of doneSessions())
    for (const ex of s.exercises)
      if (ex.key === key) { const sets = validSets(ex); if (sets.length) out.push({ session: s, ex, sets }); }
  return out;
}
function previousEntry(key, session) {
  const h = exerciseHistory(key).filter(e => e.session.id !== session.id && sessionOrder(e.session, session) < 0);
  return h[h.length - 1] || null;
}

/**
 * Füllt beim Start eines Trainings die Gewichte (nicht die Wiederholungen) mit den Werten
 * vom letzten Training dieser Übung vor. Gibt es noch keins, wird das Orientierungsgewicht genommen.
 */
function prefillWeights(session) {
  for (const ex of session.exercises) {
    const prev = previousEntry(ex.key, session);
    const ws = prev ? prev.ex.sets.filter(isValidSet).map(x => x.w) : [];
    ex.sets.forEach((set, j) => {
      if (set.w != null || set.r != null) return;
      const w = ws.length ? ws[Math.min(j, ws.length - 1)] : ex.guide;
      if (w != null) set.w = w;
    });
  }
  session.prefill = weightSignature(session);
  return session;
}
const weightSignature = session => JSON.stringify(session.exercises.map(e => e.sets.map(x => x.w)));
/** Ein Training gilt als unberührt, solange nichts außer den vorausgefüllten Gewichten drinsteht. */
const isUntouched = s => s.status === 'active' && s.exercises.every(e => !e.skipped && e.sets.every(x => x.r == null)) &&
  (s.prefill ? weightSignature(s) === s.prefill : s.exercises.every(e => e.sets.every(x => x.w == null)));

/* ---------------- Bewertung ---------------- */
const rankSets = sets => [...sets].sort((a, b) => b.w - a.w || b.r - a.r);
function cmpPair(a, b) {
  const dw = round2(a.w - b.w), dr = a.r - b.r;
  if (dw === 0 && dr === 0) return 'same';
  if (dw >= 0 && dr >= 0) return 'up';
  if (dw <= 0 && dr <= 0) return 'down';
  return 'mixed';
}
/**
 * Satz für Satz nach Rang (bester mit bestem). Der erste unterschiedliche Satz entscheidet.
 * Gegensätzliche Entwicklung (mehr kg, weniger Wdh. oder umgekehrt) entscheidet das geschätzte 1RM;
 * unter 1 % Veränderung gilt als Stagnation. Es werden nur Sätze verglichen, die in beiden Trainings existieren.
 */
function compareSets(cur, prev) {
  const A = rankSets(cur), B = rankSets(prev), n = Math.min(A.length, B.length);
  const pairs = []; let status = 'same', decisive = -1, viaE1rm = false, e1 = null;
  for (let i = 0; i < n; i++) {
    const result = cmpPair(A[i], B[i]);
    pairs.push({ cur: A[i], prev: B[i], result });
    if (decisive < 0 && result !== 'same') { status = result; decisive = i; }
  }
  if (status === 'mixed') {
    const p = pairs[decisive], c = e1rm(p.cur), q = e1rm(p.prev), pct = (c / q - 1) * 100;
    viaE1rm = true; e1 = { cur: c, prev: q, pct };
    status = Math.abs(pct) < 1 ? 'same' : pct > 0 ? 'up' : 'down';
  }
  return { status, pairs, decisive, n, viaE1rm, e1, curCount: A.length, prevCount: B.length };
}
function diffText(a, b) {
  const dw = round2(a.w - b.w), dr = a.r - b.r;
  const kg = x => `${fmtNum(Math.abs(x))} kg`, mw = x => x > 0 ? 'mehr' : 'weniger';
  if (dw === 0 && dr === 0) return 'gleiches Gewicht, gleiche Wiederholungen';
  if (dw === 0) return `${repWord(Math.abs(dr))} ${mw(dr)} bei gleichem Gewicht`;
  if (dr === 0) return `${kg(dw)} ${mw(dw)} bei gleichen Wiederholungen`;
  if ((dw > 0) === (dr > 0)) return `${kg(dw)} und ${repWord(Math.abs(dr))} ${mw(dw)}`;
  return `${kg(dw)} ${mw(dw)}, aber ${repWord(Math.abs(dr))} ${mw(dr)}`;
}
const ORD = ['beste', 'zweitbeste', 'drittbeste', 'viertbeste', 'fünftbeste', 'sechstbeste'];
function explain(c) {
  const parts = [];
  if (c.decisive < 0) {
    parts.push(`${fmtSet(c.pairs[0].cur)} wie beim letzten Mal` + (c.n > 1 ? ` – alle ${c.n} verglichenen Sätze gleich` : ''));
  } else {
    const p = c.pairs[c.decisive];
    if (c.decisive > 0) parts.push(c.decisive === 1 ? `Bester Satz gleich (${fmtSet(c.pairs[0].cur)})` : `Die ${c.decisive} besten Sätze sind gleich`);
    const prefix = c.decisive > 0 ? `${ORD[c.decisive] ? ORD[c.decisive].charAt(0).toUpperCase() + ORD[c.decisive].slice(1) + 'r' : (c.decisive + 1) + '.-bester'} Satz: ` : '';
    parts.push(`${prefix}${fmtSet(p.cur)} statt ${fmtSet(p.prev)} – ${diffText(p.cur, p.prev)}`);
    if (c.viaE1rm) {
      parts.push(`Geschätztes Maximalgewicht ${fmtNum(round1(c.e1.cur))} statt ${fmtNum(round1(c.e1.prev))} kg (${fmtPct(c.e1.pct)}` +
        `${Math.abs(c.e1.pct) < 1 ? ', unter 1 % = Stagnation' : ''}) – über geschätztes Maximalgewicht bewertet`);
    }
  }
  if (c.curCount !== c.prevCount)
    parts.push(`Heute ${c.curCount}, zuletzt ${c.prevCount} Sätze – ${c.n === 1 ? 'verglichen wurde der beste Satz' : `verglichen wurden die ${c.n} besten`}; fehlende Sätze zählen nicht als schwächer`);
  return parts.join('. ') + '.';
}
/** Trend über mindestens drei Trainings (bis einschließlich der angegebenen Einheit). */
function trendFor(key, session) {
  const h = exerciseHistory(key).filter(e => e.session.id === session.id || sessionOrder(e.session, session) < 0);
  if (h.length < 3) return null;
  let dir = null, streak = 0;
  for (let i = h.length - 1; i > 0; i--) {
    const st = compareSets(h[i].sets, h[i - 1].sets).status;
    if (dir === null) { dir = st; streak = 1; } else if (st === dir) streak++; else break;
  }
  if (streak >= 2) {
    const word = { up: 'steigend', down: 'fallend', same: 'gleichbleibend' }[dir];
    return { dir, sessions: streak + 1, text: `seit ${streak + 1} Trainings ${word}` };
  }
  return { dir: 'mixed', sessions: h.length, text: 'kein einheitlicher Trend über die letzten 3 Trainings' };
}
function analyzeExercise(session, ex) {
  if (ex.skipped) return { status: 'skipped', text: 'Übersprungen – zählt nicht als schwächer.' };
  const cur = validSets(ex);
  if (!cur.length) return { status: 'none', text: 'Keine Werte eingetragen.' };
  const prev = previousEntry(ex.key, session);
  if (!prev) return { status: 'none', cur, text: session.kind === 'baseline' ? 'Startwerte – nach dem ersten Training gibt es einen Vergleich.' : 'Noch kein früheres Training zum Vergleichen.' };
  const c = compareSets(cur, prev.sets);
  return { ...c, cur, prev, text: explain(c), trend: session.status === 'done' ? trendFor(ex.key, session) : null };
}
/** Bewertung einer Übung im Fortschritt: letztes Training mit dieser Übung gegenüber dem vorherigen. */
function latestProgress(key) {
  const all = doneSessions().filter(s => s.exercises.some(e => e.key === key));
  if (!all.length) return { status: 'none', text: 'Noch keine Werte.' };
  const s = all[all.length - 1];
  const a = analyzeExercise(s, s.exercises.find(e => e.key === key));
  a.session = s;
  if (a.status === 'skipped') a.text = `Zuletzt übersprungen (${fmtDate(s.date)}) – zählt nicht als schwächer.`;
  return a;
}

/* ---------------- Kraftentwicklung des Plans ---------------- */
/** Durchschnittliche Veränderung des geschätzten 1RM aller Planübungen gegenüber den Startwerten (bzw. dem ersten Wert). */
function planProgress(plan) {
  const keys = new Set(plan.exercises.map(e => normKey(e.name)));
  const all = doneSessions();
  const base = all.find(s => s.kind === 'baseline' && s.planId === plan.id);
  const ref = {}, cur = {}, points = [];
  for (const s of all) {
    if (base && sessionOrder(s, base) < 0) continue;
    let touched = false;
    for (const ex of s.exercises) {
      if (!keys.has(ex.key)) continue;
      const vs = validSets(ex);
      if (!vs.length) continue;
      const v = bestE1(vs);
      if (ref[ex.key] == null) ref[ex.key] = v;
      cur[ex.key] = v; touched = true;
    }
    if (touched) {
      const ks = Object.keys(cur);
      points.push({ d: s.date, y: ks.reduce((a, k) => a + (cur[k] / ref[k] - 1) * 100, 0) / ks.length, baseline: s.kind === 'baseline' });
    }
  }
  return { points, ref, cur };
}

/* ---------------- Prognose ---------------- */
const MAX_WEEKLY = 0.02;
/** Lineare Regression über das geschätzte 1RM der letzten bis zu 8 Trainings (x = Datum). */
function forecastFor(key, days, perDumbbell) {
  const h = exerciseHistory(key).slice(-8);
  if (h.length < 3) return { status: 'few', n: h.length, text: 'Für eine Prognose brauche ich mindestens 3 Trainings.' };
  const pts = h.map(e => ({ x: dayNum(e.session.date), y: bestE1(e.sets), d: e.session.date }));
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return { status: 'few', n: h.length, text: 'Für eine Prognose brauche ich Trainings an mindestens zwei verschiedenen Tagen.' };
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx; // kg 1RM pro Tag
  const last = h[h.length - 1], ref = bestSetByE1(last.sets), e0 = e1rm(ref);
  const cap = e0 * MAX_WEEKLY / 7;
  const used = slope <= 0 ? 0 : Math.min(slope, cap);
  const eF = e0 + used * days;
  const step = perDumbbell ? 1 : 2.5;
  let w = ref.w;
  if (used > 0) w = Math.max(ref.w, Math.round((eF / (1 + ref.r / 30)) / step) * step);
  const status = used > 0 ? 'up' : 'flat';
  const weeklyPct = slope * 7 / e0 * 100;
  return { status, n: h.length, slope, capped: slope > cap, weeklyPct, usedWeeklyPct: used * 7 / e0 * 100,
    e0, eF, pct: (eF / e0 - 1) * 100, w, r: ref.r, today: ref, lastDate: last.session.date, points: pts };
}
function forecastText(name, f, days) {
  if (f.status === 'few') return f.text;
  const when = days <= 31 ? 'in 1 Monat' : `in ${Math.round(days / 30.4)} Monaten`;
  if (f.status === 'flat') return `${name}: aktuell kein Anstieg – ${when} voraussichtlich weiter ca. ${fmtSet(f.today)}`;
  return `${name}: ${when} ca. ${fmtNum(f.w)} kg × ${f.r} (heute ${fmtSet(f.today)})`;
}
function planForecast(plan, days) {
  const prog = planProgress(plan);
  const per = plan.exercises.map(e => ({ e, key: normKey(e.name), f: forecastFor(normKey(e.name), days, e.perDumbbell) }));
  const withF = per.filter(x => x.f.status !== 'few');
  const pct = withF.length ? withF.reduce((a, x) => a + x.f.pct, 0) / withF.length : null;
  // Endwert der gestrichelten Linie: Veränderung gegenüber Startwerten nach Ablauf des Zeitraums
  const ks = Object.keys(prog.cur);
  let endY = null;
  if (ks.length) {
    endY = ks.reduce((a, k) => {
      const x = per.find(p => p.key === k);
      const factor = x && x.f.status !== 'few' ? 1 + x.f.pct / 100 : 1;
      return a + (prog.cur[k] * factor / prog.ref[k] - 1) * 100;
    }, 0) / ks.length;
  }
  return { per, pct, count: withF.length, prog, endY };
}

/* ---------------- Supersätze ---------------- */
/** Gruppiert aufeinanderfolgende Übungen derselben Supersatz-Gruppe zu Blöcken. */
function blocks(exs) {
  const out = [];
  exs.forEach((ex, idx) => {
    const last = out[out.length - 1];
    if (ex.group && last && last.group === ex.group) last.items.push({ ex, idx });
    else out.push({ group: ex.group || null, items: [{ ex, idx }] });
  });
  return out;
}
/** Hält Gruppen zusammenhängend, löst Gruppen mit < 2 Übungen auf und benennt sie der Reihe nach A, B, C … */
function normalizeGroups(plan) {
  const out = [], seen = new Set();
  for (const e of plan.exercises) {
    if (!e.group) { out.push(e); continue; }
    if (seen.has(e.group)) continue;
    seen.add(e.group);
    out.push(...plan.exercises.filter(x => x.group === e.group));
  }
  const counts = {};
  out.forEach(e => { if (e.group) counts[e.group] = (counts[e.group] || 0) + 1; });
  out.forEach(e => { if (e.group && counts[e.group] < 2) e.group = null; });
  const map = {}; let i = 0;
  out.forEach(e => { if (e.group && !(e.group in map)) map[e.group] = String.fromCharCode(65 + i++); });
  out.forEach(e => { if (e.group) e.group = map[e.group]; });
  plan.exercises = out;
  return plan;
}

const api = {
  uid, normKey, round2, round1, pad, todayISO, dayNum, addDaysISO, parseNum, parseInt0, fmtNum, fmtSet, fmtSets, fmtPct, fmtDate, repWord, e1rm,
  START_PLAN_ID, START_VALUES, DATA_VERSION, mkPlanEx, defaultPlan, snapshotEx, newSession, baselineSession, freshDb, validDb, migrate,
  setDb, getDb, sessionOrder, doneSessions, isValidSet, validSets, bestE1, bestSetByE1, exerciseHistory, previousEntry,
  rankSets, cmpPair, compareSets, diffText, explain, trendFor, analyzeExercise, latestProgress, planProgress,
  forecastFor, forecastText, planForecast, blocks, normalizeGroups, MAX_WEEKLY, prefillWeights, isUntouched,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
