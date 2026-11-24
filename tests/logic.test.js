// Logiktests ohne Abhängigkeiten: node tests/logic.test.js
const assert = require('assert');
const L = require('../logic.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n   ' + e.message); }
}
const today = L.todayISO();
const sets = arr => arr.map(([w, r]) => ({ w, r }));
let t0 = 1;
/** Fügt ein abgeschlossenes Training für den Standardplan hinzu. values: {Name: [[w,r],...] | 'skip'} */
function addTraining(db, date, values) {
  const plan = db.plans.find(p => p.id === L.START_PLAN_ID);
  const s = L.newSession(plan, date);
  s.createdAt = Date.now() + (t0++);
  s.status = 'done';
  s.exercises.forEach(ex => {
    const v = values[ex.name];
    if (v === 'skip' || v === undefined) ex.skipped = true; else ex.sets = sets(v);
  });
  db.sessions.push(s);
  return s;
}
const exOf = (s, name) => s.exercises.find(e => e.name === name);

test('Standardplan: 12 Übungen in richtiger Reihenfolge, Supersätze A/B', () => {
  const db = L.freshDb(); L.setDb(db);
  const p = db.plans[0];
  assert.deepStrictEqual(p.exercises.map(e => e.name), ['Hackenschmidt', 'Kreuzheben', 'Bankdrücken mit Kurzhanteln', 'Latziehen',
    'Butterfly mit Kurzhanteln', 'Rudern aufrecht', 'Schulterdrücken', 'Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Hammercurls', 'Trizeps am Turm 2']);
  assert.deepStrictEqual(p.exercises.map(e => e.group || '-').join(''), '-------AAABB');
  assert.deepStrictEqual(p.exercises.map(e => e.sets), [3, 2, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2]);
  assert.strictEqual(db.activePlanId, p.id);
  const blocks = L.blocks(p.exercises);
  assert.strictEqual(blocks.length, 9);
  assert.deepStrictEqual(blocks[7].items.map(i => i.ex.name), ['Bizepscurls', 'Trizeps am Turm 1', 'Seitheben']);
});

test('Startwerte: Ausgangstraining mit heutigem Datum und Dezimalgewichten', () => {
  const db = L.freshDb(); L.setDb(db);
  const b = db.sessions[0];
  assert.strictEqual(b.kind, 'baseline'); assert.strictEqual(b.date, today); assert.strictEqual(b.status, 'done');
  assert.deepStrictEqual(exOf(b, 'Kreuzheben').sets, sets([[42.5, 12], [42.5, 10]]));
  assert.deepStrictEqual(exOf(b, 'Hammercurls').sets, sets([[12.5, 13], [12.5, 12]]));
  assert.strictEqual(L.fmtSets(exOf(b, 'Latziehen').sets), '45 kg × 12 / 12 / 10');
  assert.strictEqual(L.fmtSets(exOf(b, 'Kreuzheben').sets), '42,5 kg × 12 / 10');
});

test('Dezimaleingaben 12,5 / 42,5 / 12.5 werden gelesen, Unsinn abgelehnt', () => {
  assert.strictEqual(L.parseNum('12,5'), 12.5); assert.strictEqual(L.parseNum('42,5'), 42.5); assert.strictEqual(L.parseNum('12.5'), 12.5);
  assert.strictEqual(L.parseNum(''), null); assert.ok(Number.isNaN(L.parseNum('12,5,1'))); assert.ok(Number.isNaN(L.parseInt0('1,5')));
  assert.strictEqual(L.fmtNum(42.5), '42,5');
});

// Ein erstes echtes Training gegenüber den Startwerten
const db1 = L.freshDb(); L.setDb(db1);
const s1 = addTraining(db1, today, {
  'Latziehen': [[45, 12], [45, 12], [45, 12]],            // grün
  'Hackenschmidt': [[10, 12], [10, 12], [10, 8]],         // gelb
  'Rudern aufrecht': [[20, 12], [20, 11], [20, 12]],      // orange
  'Kreuzheben': [[45, 10], [42.5, 10]],                   // gegensätzlich, 1RM +0,8 % => gelb
  'Schulterdrücken': [[17.5, 10], [15, 12], [15, 10]],    // gegensätzlich, 1RM +4,4 % => grün
  'Butterfly mit Kurzhanteln': [[22, 13], [25, 11], [25, 9]], // Rang: 25×11 vs 25×12 => orange
  'Hammercurls': [[12.5, 13], [12.5, 13]],                // Dezimal, grün
  'Bankdrücken mit Kurzhanteln': [[35, 12]],              // nur 1 Satz, bester gleich => gelb, fehlende Sätze nicht schwächer
  'Bizepscurls': [[12, 14], [12, 13]],
  'Trizeps am Turm 1': [[18, 13], [18, 13]],
  'Seitheben': 'skip',
  'Trizeps am Turm 2': [[18, 13], [18, 11]],
});
const A = name => L.analyzeExercise(s1, exOf(s1, name));

test('Grün: mehr Wiederholungen bei gleichem Gewicht', () => {
  const a = A('Latziehen');
  assert.strictEqual(a.status, 'up');
  assert.ok(a.text.includes('45 kg × 12 statt 45 kg × 10 – zwei Wiederholungen mehr bei gleichem Gewicht'), a.text);
});
test('Gelb: alles gleich', () => { assert.strictEqual(A('Hackenschmidt').status, 'same'); });
test('Orange: weniger Wiederholungen bei gleichem Gewicht', () => {
  const a = A('Rudern aufrecht'); assert.strictEqual(a.status, 'down'); assert.ok(a.text.includes('eine Wiederholung weniger'), a.text);
});
test('Gegensätzlich, 1RM-Änderung < 1 % => Stagnation mit Hinweis', () => {
  const a = A('Kreuzheben');
  assert.strictEqual(a.status, 'same'); assert.ok(a.viaE1rm);
  assert.ok(a.text.includes('45 kg × 10 statt 42,5 kg × 12'), a.text);
  assert.ok(a.text.includes('über geschätztes Maximalgewicht bewertet'), a.text);
});
test('Gegensätzlich, 1RM deutlich höher => stärker', () => {
  const a = A('Schulterdrücken'); assert.strictEqual(a.status, 'up'); assert.ok(a.viaE1rm);
  assert.ok(a.text.includes('17,5 kg × 10 statt 15 kg × 12'), a.text);
});
test('Vergleich nach Rang (bester mit bestem)', () => { const a = A('Butterfly mit Kurzhanteln'); assert.strictEqual(a.status, 'down'); assert.ok(a.text.includes('25 kg × 11 statt 25 kg × 12'), a.text); });
test('Dezimalgewicht 12,5 wird korrekt verglichen', () => { const a = A('Hammercurls'); assert.strictEqual(a.status, 'up'); assert.ok(a.text.includes('12,5 kg × 13 statt 12,5 kg × 12'), a.text); });
test('Fehlende Sätze zählen nicht als schwächer', () => { const a = A('Bankdrücken mit Kurzhanteln'); assert.strictEqual(a.status, 'same'); assert.ok(a.text.includes('fehlende Sätze zählen nicht als schwächer')); });
test('Übersprungen => grau, nicht orange; Supersatz-Partner normal', () => {
  assert.strictEqual(A('Seitheben').status, 'skipped');
  assert.strictEqual(L.latestProgress('seitheben').status, 'skipped');
  assert.strictEqual(A('Bizepscurls').status, 'up');
  assert.strictEqual(A('Trizeps am Turm 1').status, 'same');
});
test('Fortschritt: letztes Training gegen vorheriges', () => {
  assert.strictEqual(L.latestProgress('latziehen').status, 'up');
  assert.strictEqual(L.latestProgress('trizeps am turm 2').status, 'up');
  assert.strictEqual(L.latestProgress('rudern aufrecht').status, 'down');
});
test('Plan-Kraftkurve startet bei 0 % (Startwerte) und steigt', () => {
  const pr = L.planProgress(db1.plans[0]);
  assert.strictEqual(pr.points.length, 2);
  assert.ok(Math.abs(pr.points[0].y) < 1e-9);
  assert.ok(pr.points[1].y > 0 && pr.points[1].y < 5, String(pr.points[1].y));
});

test('Trend erst ab 3 Trainings: "seit 3 Trainings steigend"', () => {
  const db = L.freshDb(); L.setDb(db);
  const a = addTraining(db, L.addDaysISO(today, 2), { 'Latziehen': [[45, 12], [45, 12], [45, 11]] });
  assert.strictEqual(L.trendFor('latziehen', a), null);
  const b = addTraining(db, L.addDaysISO(today, 4), { 'Latziehen': [[45, 12], [45, 12], [45, 12]] });
  const t = L.trendFor('latziehen', b);
  assert.strictEqual(t.dir, 'up'); assert.strictEqual(t.text, 'seit 3 Trainings steigend');
});

test('Ausblick: mit 2 Trainings Hinweistext', () => {
  L.setDb(db1);
  const f = L.forecastFor('latziehen', 182, false);
  assert.strictEqual(f.status, 'few'); assert.strictEqual(f.text, 'Für eine Prognose brauche ich mindestens 3 Trainings.');
});
test('Ausblick: plausible, gerundete Prognose (2,5 kg / 1 kg) über Datum', () => {
  const db = L.freshDb(); L.setDb(db);
  db.sessions[0].date = L.addDaysISO(today, -28);
  addTraining(db, L.addDaysISO(today, -14), { 'Latziehen': [[45, 13], [45, 12], [45, 11]], 'Hammercurls': [[12.5, 13], [12.5, 13]] });
  addTraining(db, today, { 'Latziehen': [[47.5, 12], [45, 12], [45, 12]], 'Hammercurls': [[13, 13], [13, 12]] });
  const f = L.forecastFor('latziehen', 182, false);
  assert.strictEqual(f.status, 'up');
  assert.strictEqual(f.w % 2.5, 0); assert.ok(f.w > 47.5 && f.w <= 70, String(f.w)); assert.strictEqual(f.r, 12);
  assert.ok(f.usedWeeklyPct <= 2.0001);
  const txt = L.forecastText('Latziehen', f, 182);
  assert.ok(/^Latziehen: in 6 Monaten ca\. [\d,]+ kg × 12 \(heute 47,5 kg × 12\)$/.test(txt), txt);
  const h = L.forecastFor('hammercurls', 182, true);
  assert.strictEqual(h.w % 1, 0, String(h.w));
  console.log('   Beispiel: ' + txt + ' | ' + L.forecastText('Hammercurls', h, 182));
});
test('Ausblick: Deckelung auf +2 % pro Woche', () => {
  const db = L.freshDb(); L.setDb(db);
  db.sessions[0].date = L.addDaysISO(today, -14);
  addTraining(db, L.addDaysISO(today, -7), { 'Latziehen': [[55, 12], [55, 12], [55, 12]] });
  addTraining(db, today, { 'Latziehen': [[65, 12], [65, 12], [65, 12]] });
  const f = L.forecastFor('latziehen', 182, false);
  assert.ok(f.capped); assert.ok(Math.abs(f.usedWeeklyPct - 2) < 1e-9);
  // 26 Wochen × 2 % linear = +52 % => 65 × 1,52 = 98,8 => gerundet 100
  assert.strictEqual(f.w, 100);
});
test('Ausblick: sinkender Trend => "aktuell kein Anstieg", keine sinkende Prognose', () => {
  const db = L.freshDb(); L.setDb(db);
  db.sessions[0].date = L.addDaysISO(today, -14);
  addTraining(db, L.addDaysISO(today, -7), { 'Latziehen': [[45, 10], [45, 10], [45, 10]] });
  addTraining(db, today, { 'Latziehen': [[42.5, 10], [42.5, 10], [42.5, 9]] });
  const f = L.forecastFor('latziehen', 182, false);
  assert.strictEqual(f.status, 'flat'); assert.strictEqual(f.pct, 0); assert.strictEqual(f.w, 42.5);
  assert.ok(L.forecastText('Latziehen', f, 182).includes('aktuell kein Anstieg'));
});
test('Gesamtprognose des Plans in Prozent', () => {
  const db = L.freshDb(); L.setDb(db);
  db.sessions[0].date = L.addDaysISO(today, -28);
  addTraining(db, L.addDaysISO(today, -14), { 'Latziehen': [[45, 12], [45, 12], [45, 11]] });
  addTraining(db, today, { 'Latziehen': [[47.5, 12], [45, 12], [45, 12]] });
  const pf = L.planForecast(db.plans[0], 30);
  assert.strictEqual(pf.count, 1); assert.ok(pf.pct > 0 && pf.pct <= 2 * 30 / 7 + 1e-9, String(pf.pct));
});

test('Vorausfüllen: kg vom letzten Training, Wiederholungen leer', () => {
  const db = L.freshDb(); L.setDb(db);
  const plan = db.plans[0];
  const a = L.prefillWeights(L.newSession(plan, today));
  assert.deepStrictEqual(exOf(a, 'Kreuzheben').sets, [{ w: 42.5, r: null }, { w: 42.5, r: null }]);
  assert.deepStrictEqual(exOf(a, 'Hammercurls').sets.map(x => x.w), [12.5, 12.5]);
  assert.ok(a.exercises.every(e => e.sets.every(x => x.r == null)));
  assert.ok(L.isUntouched(a), 'nur vorausgefüllt = unberührt');
  // Letztes echtes Training hat Vorrang; fehlende Sätze nehmen das letzte vorhandene Gewicht
  addTraining(db, today, { 'Latziehen': [[47.5, 12], [45, 12]], 'Seitheben': 'skip' });
  const b2 = L.prefillWeights((() => { const x = L.newSession(plan, today); x.createdAt = Date.now() + 1000; return x; })());
  assert.deepStrictEqual(exOf(b2, 'Latziehen').sets.map(x => x.w), [47.5, 45, 45]);
  // Übersprungen zählt nicht: Seitheben fällt auf die Startwerte zurück
  assert.deepStrictEqual(exOf(b2, 'Seitheben').sets.map(x => x.w), [5, 5]);
  exOf(b2, 'Latziehen').sets[0].w = 50;
  assert.ok(!L.isUntouched(b2), 'geändertes Gewicht = angefangen');
  exOf(b2, 'Latziehen').sets[0].w = 47.5; exOf(b2, 'Latziehen').sets[0].r = 10;
  assert.ok(!L.isUntouched(b2), 'eingetragene Wiederholungen = angefangen');
});
test('Vorausfüllen ohne Vorgeschichte: Orientierungsgewicht oder leer', () => {
  const db = L.freshDb(); L.setDb(db);
  const plan = { id: 'p', name: 'Neu', exercises: [L.mkPlanEx('Beinpresse', 2, 80), L.mkPlanEx('Plank', 2, null)] };
  const s = L.prefillWeights(L.newSession(plan, today));
  assert.deepStrictEqual(s.exercises[0].sets.map(x => x.w), [80, 80]);
  assert.deepStrictEqual(s.exercises[1].sets.map(x => x.w), [null, null]);
});
const v1 = require('./v1-sample.json'); // Daten im alten Format (Version 1)
test('Migration: Version 1 lädt ohne Fehler, Trainings bleiben erhalten', () => {
  const d = L.migrate(v1); L.setDb(d);
  assert.strictEqual(d.version, 2);
  assert.strictEqual(d.activePlanId, L.START_PLAN_ID);
  assert.deepStrictEqual(d.plans.map(p => p.name), ['Ganzkörperplan', 'Mein Oberkörper']);
  assert.deepStrictEqual(d.plans[1].exercises.map(e => e.name), ['Dips', 'Curl SZ', 'Curl KH']);
  assert.ok(d.sessions.some(s => s.id === 'old1'));
  assert.strictEqual(d.sessions.filter(s => s.kind === 'baseline').length, 1);
  const old = d.sessions.find(s => s.id === 'old1');
  assert.deepStrictEqual(old.exercises.map(e => e.name), ['Latziehen', 'Hammercurls', 'Kurzhantelbankdrücken (Flachbank)']);
  // Alte Übung, die im neuen Plan fehlt, bleibt im Verlauf
  assert.strictEqual(L.exerciseHistory('kurzhantelbankdrücken (flachbank)').length, 1);
  // Alte Latziehen-Werte liegen vor den Startwerten im Verlauf
  assert.strictEqual(L.exerciseHistory('latziehen').length, 2);
  assert.strictEqual(v1.version, 1, 'Eingabe darf nicht verändert werden');
});
test('Migration ist wiederholbar (keine doppelten Startwerte)', () => {
  const d = L.migrate(L.migrate(v1));
  assert.strictEqual(d.sessions.filter(s => s.kind === 'baseline').length, 1);
});
test('Export → Import ergibt denselben Datenstand', () => {
  const db = L.freshDb(); L.setDb(db); addTraining(db, today, { 'Latziehen': [[45, 12]] });
  const file = JSON.stringify({ app: 'trainingsapp', version: 2, data: db });
  const back = L.migrate(JSON.parse(file).data);
  assert.deepStrictEqual(back, db);
});
test('Supersätze: zusammenhängend halten, neu benennen, Einzelgruppen auflösen', () => {
  const p = { exercises: [{ name: 'a', group: 'B' }, { name: 'b', group: null }, { name: 'c', group: 'B' }, { name: 'd', group: 'X' }, { name: 'e', group: 'Q' }, { name: 'f', group: 'Q' }] };
  L.normalizeGroups(p);
  assert.deepStrictEqual(p.exercises.map(e => e.name + (e.group || '')), ['aA', 'cA', 'b', 'd', 'eB', 'fB']);
});
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
