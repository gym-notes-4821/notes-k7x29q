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

test('Standardplan: 14 Übungen in richtiger Reihenfolge, Supersätze A/B', () => {
  const db = L.freshDb(); L.setDb(db);
  const p = db.plans[0];
  assert.deepStrictEqual(p.exercises.map(e => e.name), ['Squats', 'Kreuzheben', 'Latziehen', 'Bankdrücken mit Kurzhanteln',
    'Rudern sitzend', 'Butterfly mit Kurzhanteln', 'Schulterdrücken', 'Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Vorgebeugtes Seitheben', 'Hammercurls', 'Trizeps am Turm 2', 'Crunches am Kabelzug']);
  assert.deepStrictEqual(p.exercises.map(e => e.group || '-').join(''), '-------AAAABBB');
  assert.deepStrictEqual(p.exercises.map(e => e.sets), [3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.strictEqual(new Set(p.exercises.map(e => e.id)).size, p.exercises.length, 'IDs eindeutig');
  assert.deepStrictEqual(p.exercises.slice(2, 7).map(e => e.guide), [45, 17.5, 20, 12.5, 7.5]);
  assert.strictEqual(db.activePlanId, p.id);
  const blocks = L.blocks(p.exercises);
  assert.strictEqual(blocks.length, 9);
  assert.deepStrictEqual(blocks[7].items.map(i => i.ex.name), ['Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Vorgebeugtes Seitheben']);
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
  'Squats': [[10, 12], [10, 12], [10, 8]],         // gelb
  'Rudern sitzend': [[20, 12], [20, 11], [20, 12]],      // orange
  'Kreuzheben': [[45, 10], [42.5, 10]],                   // gegensätzlich, 1RM +0,8 % => gelb
  'Schulterdrücken': [[10, 10], [7.5, 12], [7.5, 10]],    // gegensätzlich, 1RM +27 % => grün
  'Butterfly mit Kurzhanteln': [[11, 13], [12.5, 11], [12.5, 9]], // Rang: 12,5×11 vs 12,5×12 => orange
  'Hammercurls': [[12.5, 13], [12.5, 13]],                // Dezimal, grün
  'Bankdrücken mit Kurzhanteln': [[17.5, 12]],              // nur 1 Satz, bester gleich => gelb, fehlende Sätze nicht schwächer
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
test('Gelb: alles gleich', () => { assert.strictEqual(A('Squats').status, 'same'); });
test('Orange: weniger Wiederholungen bei gleichem Gewicht', () => {
  const a = A('Rudern sitzend'); assert.strictEqual(a.status, 'down'); assert.ok(a.text.includes('eine Wiederholung weniger'), a.text);
});
test('Gegensätzlich, 1RM-Änderung < 1 % => Stagnation mit Hinweis', () => {
  const a = A('Kreuzheben');
  assert.strictEqual(a.status, 'same'); assert.ok(a.viaE1rm);
  assert.ok(a.text.includes('45 kg × 10 statt 42,5 kg × 12'), a.text);
  assert.ok(a.text.includes('über geschätztes Maximalgewicht bewertet'), a.text);
});
test('Gegensätzlich, 1RM deutlich höher => stärker', () => {
  const a = A('Schulterdrücken'); assert.strictEqual(a.status, 'up'); assert.ok(a.viaE1rm);
  assert.ok(a.text.includes('10 kg × 10 statt 7,5 kg × 12'), a.text);
});
test('Vergleich nach Rang (bester mit bestem)', () => { const a = A('Butterfly mit Kurzhanteln'); assert.strictEqual(a.status, 'down'); assert.ok(a.text.includes('12,5 kg × 11 statt 12,5 kg × 12'), a.text); });
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
  assert.strictEqual(L.latestProgress('rudern sitzend').status, 'down');
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
test('Ausblick: Deckelung auf +1 % pro Woche, mit der Zeit abflachend', () => {
  const db = L.freshDb(); L.setDb(db);
  db.sessions[0].date = L.addDaysISO(today, -14);
  addTraining(db, L.addDaysISO(today, -7), { 'Latziehen': [[55, 12], [55, 12], [55, 12]] });
  addTraining(db, today, { 'Latziehen': [[65, 12], [65, 12], [65, 12]] });
  const f = L.forecastFor('latziehen', 182, false);
  assert.ok(f.capped); assert.ok(Math.abs(f.usedWeeklyPct - 1) < 1e-9);
  // 1 % pro Woche, aber abflachend: nach 26 Wochen wirken nur ca. 10,6 „volle“ Wochen
  assert.ok(Math.abs(L.effWeeks(182) - 10.63) < 0.01, String(L.effWeeks(182)));
  assert.ok(f.pct > 10 && f.pct < 11, String(f.pct));
  assert.strictEqual(f.w, 72.5); // 65 kg × 12 → ca. 72,5 kg × 12 in 6 Monaten
  // anfangs fast linear: 1 Monat ≈ 4 Wochen × 1 %
  const m1 = L.forecastFor('latziehen', 30, false);
  assert.ok(m1.pct > 3.5 && m1.pct < 4.3, String(m1.pct));
  assert.ok(f.at(91) - f.e0 < (f.at(182) - f.e0), 'steigt weiter');
  assert.ok((f.at(91) - f.e0) > (f.at(182) - f.at(91)), 'zweites Vierteljahr bringt weniger als das erste');
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
  assert.deepStrictEqual(exOf(a, 'Kreuzheben').sets, [{ w: 42.5, r: null }, { w: 42.5, r: null }, { w: 42.5, r: null }]);
  assert.deepStrictEqual(exOf(a, 'Bankdrücken mit Kurzhanteln').sets.map(x => x.w), [17.5, 17.5, 17.5]);
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
test('Muskelbereiche: Squats trainieren mehr als den Oberschenkel', () => {
  const m = L.musclesOf('Squats');
  assert.strictEqual(m.quads, 1); assert.strictEqual(m.glutes, 1);
  assert.ok(m.adductors > 0 && m.lowerback > 0 && m.abs > 0 && m.hamstrings > 0 && m.calves > 0);
  // Reihenfolge der Regeln: spezielle Namen vor allgemeinen
  assert.deepStrictEqual(Object.keys(L.musclesOf('Hammercurls')), ['biceps', 'forearms']);
  assert.ok(L.musclesOf('Rudern aufrecht').shoulders === 1 && !L.musclesOf('Rudern aufrecht').upperback);
  assert.strictEqual(L.musclesOf('Brustgestütztes Rudern').upperback, 1);
  assert.strictEqual(L.musclesOf('Reverse Butterfly').reardelts, 1);
  assert.strictEqual(L.musclesOf('Butterfly mit Kurzhanteln').chest, 1);
  assert.strictEqual(L.musclesOf('Beinbeuger (Leg Curl)').hamstrings, 1);
  assert.strictEqual(L.musclesOf('Trizeps am Turm 1').triceps, 1);
  assert.strictEqual(L.musclesOf('Crunches am Kabelzug').abs, 1);
  assert.strictEqual(L.musclesOf('Yoga'), null);
});
test('Muskelbereiche: Belastung je Plan = Sätze × Beteiligung, mit Stufen', () => {
  const plan = { exercises: [L.mkPlanEx('Squats', 3, 50), L.mkPlanEx('Wadenheben', 1, 40), L.mkPlanEx('Yoga', 2, null)] };
  const { load, unknown } = L.planMuscleLoad(plan);
  assert.strictEqual(load.quads, 3); assert.strictEqual(load.calves, 1.75); assert.strictEqual(load.adductors, 1.5);
  assert.deepStrictEqual(unknown, ['Yoga']);
  assert.deepStrictEqual([0, 1, 2, 4].map(L.muscleLevel), [0, 1, 2, 3]);
  const std = L.planMuscleLoad(L.defaultPlan()).load;
  assert.strictEqual(L.muscleLevel(std.chest), 3); assert.strictEqual(L.muscleLevel(std.glutes), 3);
  assert.strictEqual(L.muscleLevel(std.calves), 1);
});
test('Pausen: Grundübungen länger, Supersatz erst nach der ganzen Runde', () => {
  assert.deepStrictEqual(['Squats', 'Kreuzheben', 'Latziehen', 'Rudern sitzend', 'Bankdrücken mit Kurzhanteln', 'Butterfly mit Kurzhanteln', 'Seitheben', 'Rudern aufrecht'].map(L.defaultRest),
    [120, 120, 90, 90, 90, 60, 60, 60]);
  const db = L.freshDb(); L.setDb(db);
  const s = L.newSession(db.plans[0], today);
  const idx = n => s.exercises.findIndex(e => e.name === n);
  assert.strictEqual(L.restAfter(s, 0, 0), null, 'leerer Satz: keine Pause');
  s.exercises[0].sets[0] = { w: 10, r: 12 };
  assert.strictEqual(L.restAfter(s, 0, 0), 120);
  const A = ['Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Vorgebeugtes Seitheben'];
  s.exercises[idx('Bizepscurls')].sets[0] = { w: 12, r: 13 };
  assert.strictEqual(L.restAfter(s, idx('Bizepscurls'), 0), null, 'Runde noch nicht fertig');
  s.exercises[idx('Trizeps am Turm 1')].sets[0] = { w: 18, r: 13 };
  s.exercises[idx('Seitheben')].sets[0] = { w: 5, r: 13 };
  s.exercises[idx('Vorgebeugtes Seitheben')].skipped = true;   // übersprungene Übung zählt nicht
  assert.strictEqual(L.restAfter(s, idx('Seitheben'), 0), 60, 'Runde komplett');
  assert.ok(A.every(n => db.plans[0].exercises.find(e => e.name === n).rest === 60));
});
test('Aufwärmsätze zählen nicht für Vergleich und Vorausfüllen', () => {
  const db = L.freshDb(); L.setDb(db);
  const s = addTraining(db, today, { 'Latziehen': [[20, 15], [45, 12], [45, 12], [45, 11]] });
  exOf(s, 'Latziehen').sets[0].warm = true;
  assert.deepStrictEqual(L.validSets(exOf(s, 'Latziehen')).map(x => x.w), [45, 45, 45]);
  const a = L.analyzeExercise(s, exOf(s, 'Latziehen'));
  assert.strictEqual(a.status, 'up'); assert.strictEqual(a.curCount, 3);
  const n0 = L.newSession(db.plans[0], today); n0.createdAt = Date.now() + 9999;
  assert.deepStrictEqual(exOf(L.prefillWeights(n0), 'Latziehen').sets.map(x => x.w), [45, 45, 45], 'Aufwärmsatz nicht übernommen');
  assert.strictEqual(L.restAfter(s, s.exercises.indexOf(exOf(s, 'Latziehen')), 0), 60, 'kurze Pause nach dem Aufwärmen');
});
test('Rekorde: Gewicht, Wiederholungen bei bekanntem Gewicht, sonst 1RM; kein Rekord beim ersten Mal', () => {
  const db = L.freshDb(); L.setDb(db);
  const a = addTraining(db, today, { 'Latziehen': [[47.5, 10], [45, 13], [45, 12]], 'Squats': [[10, 12], [10, 12], [10, 8]], 'Crunches am Kabelzug': [[20, 15], [20, 14]] });
  const rec = n => L.recordsFor(a, exOf(a, n)).map(r => r.type);
  assert.deepStrictEqual(rec('Latziehen'), ['weight', 'reps']); // 47,5 kg neu; 45 kg × 13 statt × 12
  assert.deepStrictEqual(rec('Squats'), []);                   // alles gleich wie Startwerte
  assert.deepStrictEqual(rec('Crunches am Kabelzug'), []);     // erstes Mal: kein Rekord
  assert.ok(L.recordsFor(a, exOf(a, 'Latziehen'))[0].text.startsWith('Höchstes Gewicht: 47,5 kg × 10'));
});
test('Trainingsstatistik und Kurztexte', () => {
  const db = L.freshDb(); L.setDb(db);
  const s = addTraining(db, today, { 'Latziehen': [[45, 12], [45, 12], [45, 12]], 'Bankdrücken mit Kurzhanteln': [[17.5, 10]], 'Kreuzheben': [[45, 10], [42.5, 10]] });
  s.startedAt = 1000; s.finishedAt = 1000 + 62 * 60000;
  const st = L.sessionStats(s);
  assert.strictEqual(st.sets, 6); assert.strictEqual(Math.round(st.minutes), 62);
  assert.strictEqual(st.volume, 45 * 36 + 17.5 * 10 * 2 + 450 + 425);
  assert.strictEqual(L.shortDelta(L.analyzeExercise(s, exOf(s, 'Latziehen'))), '+2 Wdh. bei 45 kg');
  assert.ok(L.shortDelta(L.analyzeExercise(s, exOf(s, 'Kreuzheben'))).startsWith('1RM '));
  assert.strictEqual(L.shortDelta(L.analyzeExercise(s, exOf(s, 'Seitheben'))), 'zuletzt übersprungen');
  assert.strictEqual(L.weekCount(today), 1);
});
test('Notizen hängen am Übungsnamen und folgen Umbenennungen', () => {
  const db = L.freshDb(); L.setDb(db);
  L.setNote('latziehen', '  Sitz 4, Griff breit ');
  assert.strictEqual(L.noteFor('latziehen'), 'Sitz 4, Griff breit');
  L.renameExercise('Latziehen', 'Latzug');
  assert.strictEqual(L.noteFor('latzug'), 'Sitz 4, Griff breit', 'Notiz zieht beim Umbenennen mit');
  assert.strictEqual(L.noteFor('latziehen'), 'Sitz 4, Griff breit', 'auch über den alten Namen auffindbar');
  L.setNote('latzug', ''); assert.strictEqual(L.noteFor('latzug'), '', 'leere Notiz löscht');
});
const v1 = require('./v1-sample.json'); // Daten im alten Format (Version 1)
test('Migration: Version 1 lädt ohne Fehler, Trainings bleiben erhalten', () => {
  const d = L.migrate(v1); L.setDb(d);
  assert.strictEqual(d.version, L.DATA_VERSION);
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
test('Migration Version 2 → 3: Kurzhanteln pro Hantel, Kreuzheben 3 Sätze, echte Trainings unverändert', () => {
  // Datenstand wie auf dem iPhone vor dem Update nachbauen
  const old = L.freshDb();
  old.version = 2;
  const plan = old.plans[0];
  const OLD = { 'Bankdrücken mit Kurzhanteln': 35, 'Butterfly mit Kurzhanteln': 25, 'Schulterdrücken': 15 };
  for (const e of plan.exercises) { if (OLD[e.name]) e.guide = OLD[e.name]; if (e.name === 'Kreuzheben') e.sets = 2; }
  for (const ex of old.sessions[0].exercises) {
    if (OLD[ex.name]) { ex.guide = OLD[ex.name]; ex.sets.forEach(x => { x.w = OLD[ex.name]; }); }
    if (ex.name === 'Kreuzheben') ex.targetSets = 2;
  }
  L.setDb(old);
  // ein echtes, abgeschlossenes Training mit 35 kg bleibt, wie es ist
  const real = addTraining(old, today, { 'Bankdrücken mit Kurzhanteln': [[35, 12]] });
  // ein nur geöffnetes Training mit vorausgefüllten alten Gewichten
  const act = L.newSession(plan, today); act.createdAt = Date.now() + 5000;
  act.exercises.forEach(ex => { if (OLD[ex.name]) ex.sets.forEach(x => { x.w = OLD[ex.name]; }); });
  act.exercises.find(e => e.name === 'Kreuzheben').sets.forEach(x => { x.w = 42.5; });
  act.prefill = JSON.stringify(act.exercises.map(e => e.sets.map(x => x.w)));
  old.sessions.push(act);
  const d = L.migrate(old); L.setDb(d);
  assert.ok(d.version >= 3);
  const p = d.plans[0];
  assert.deepStrictEqual(p.exercises.map(e => e.name === 'Kreuzheben' ? e.sets : e.guide).slice(1, 7), [3, 45, 17.5, 20, 12.5, 7.5]); // Reihenfolge ab Version 9
  const base = d.sessions.find(s => s.kind === 'baseline');
  assert.deepStrictEqual(exOf(base, 'Bankdrücken mit Kurzhanteln').sets.map(x => x.w), [17.5, 17.5, 17.5]);
  assert.deepStrictEqual(exOf(base, 'Schulterdrücken').sets.map(x => x.w), [7.5, 7.5, 7.5]);
  assert.deepStrictEqual(exOf(base, 'Kreuzheben').sets, [{ w: 42.5, r: 12 }, { w: 42.5, r: 10 }]);
  assert.deepStrictEqual(exOf(d.sessions.find(s => s.id === real.id), 'Bankdrücken mit Kurzhanteln').sets, [{ w: 35, r: 12 }]);
  const a2 = d.sessions.find(s => s.id === act.id);
  assert.deepStrictEqual(exOf(a2, 'Butterfly mit Kurzhanteln').sets.map(x => x.w), [12.5, 12.5]); // ab Version 9: 2 Sätze
  assert.deepStrictEqual(exOf(a2, 'Kreuzheben').sets.map(x => x.w), [42.5, 42.5, 42.5]);
  assert.ok(L.isUntouched(a2), 'umgestelltes, nur geöffnetes Training bleibt "unberührt"');
  // Neues Training startet mit 3 Sätzen Kreuzheben und kg pro Hantel
  const n0 = L.newSession(p, today); n0.createdAt = Date.now() + 10000;
  const n = L.prefillWeights(n0);
  assert.deepStrictEqual(exOf(n, 'Kreuzheben').sets.length, 3);
  assert.deepStrictEqual(exOf(n, 'Bankdrücken mit Kurzhanteln').sets.map(x => x.w), [35, 35, 35], 'echtes Training (35) ist das letzte Mal');
  assert.strictEqual(L.migrate(d).plans[0].exercises.find(e => e.name === 'Schulterdrücken').guide, 7.5, 'nicht doppelt halbiert');
});
test('Migration Version 3 → 4: Hackenschmidt wird Squats, Verlauf läuft weiter, Trainings unverändert', () => {
  // Stand vor dem Update nachbauen: Plan und Trainings mit „Hackenschmidt“
  const old = L.freshDb(); old.version = 3; L.setDb(old);
  const plan = old.plans[0];
  plan.exercises[0].name = 'Hackenschmidt';
  const rn = s => { const ex = s.exercises[0]; ex.name = 'Hackenschmidt'; ex.key = 'hackenschmidt'; };
  rn(old.sessions[0]);
  const real = addTraining(old, today, { 'Hackenschmidt': [[12.5, 12], [12.5, 11], [12.5, 9]] });
  const act = L.newSession(plan, today); act.createdAt = Date.now() + 9000; rn(act); old.sessions.push(act);
  const d = L.migrate(old); L.setDb(d);
  assert.ok(d.version >= 4);
  assert.strictEqual(d.plans[0].exercises[0].name, 'Squats');
  assert.deepStrictEqual(d.renames, { hackenschmidt: 'squats' });
  // gespeicherte Trainings behalten den alten Namen …
  assert.strictEqual(exOf(d.sessions.find(s => s.id === real.id), 'Hackenschmidt').sets[0].w, 12.5);
  assert.strictEqual(d.sessions.find(s => s.kind === 'baseline').exercises[0].name, 'Hackenschmidt');
  // … das offene, noch leere Training wird zu Squats
  assert.strictEqual(d.sessions.find(s => s.id === act.id).exercises[0].name, 'Squats');
  // Verlauf läuft unter Squats weiter
  assert.strictEqual(L.exerciseHistory('squats').length, 2);
  const n0 = L.newSession(d.plans[0], today); n0.createdAt = Date.now() + 20000;
  const n = L.prefillWeights(n0);
  assert.deepStrictEqual(exOf(n, 'Squats').sets.map(x => x.w), [12.5, 12.5, 12.5], 'kg vom letzten Hackenschmidt-Training');
  const prev = L.previousEntry('squats', n);
  assert.strictEqual(prev.ex.name, 'Hackenschmidt');
  exOf(n, 'Squats').sets = sets([[12.5, 12], [12.5, 12], [12.5, 9]]); n.status = 'done'; d.sessions.push(n);
  const a = L.analyzeExercise(n, exOf(n, 'Squats'));
  assert.strictEqual(a.status, 'up'); assert.ok(a.text.includes('12,5 kg × 12 statt 12,5 kg × 11'), a.text);
  assert.strictEqual(L.latestProgress('squats').status, 'up');
  assert.ok(L.planProgress(d.plans[0]).points.length >= 2);
  assert.strictEqual(L.migrate(d).plans[0].exercises[0].name, 'Squats', 'wiederholbar');
});
test('Umbenennen mit weiterlaufendem Verlauf, auch hin und zurück', () => {
  const db = L.freshDb(); L.setDb(db);
  addTraining(db, today, { 'Latziehen': [[45, 12]] });
  L.renameExercise('Latziehen', 'Latzug');
  assert.strictEqual(L.exerciseHistory('latzug').length, 2);
  assert.strictEqual(L.canon('latziehen'), 'latzug');
  L.renameExercise('Latzug', 'Latziehen');            // zurück: keine Endlosschleife
  assert.strictEqual(L.canon('latzug'), 'latziehen');
  assert.strictEqual(L.exerciseHistory('latziehen').length, 2);
});
test('Migration Version 4 → 5: Crunches am Kabelzug in Supersatz B, auch im offenen Training', () => {
  const old = L.freshDb(); L.setDb(old);
  const plan = old.plans[0];
  plan.exercises = plan.exercises.filter(e => e.name !== 'Crunches am Kabelzug');
  old.sessions[0].exercises = old.sessions[0].exercises.filter(e => e.name !== 'Crunches am Kabelzug');
  old.version = 4;
  const act = L.prefillWeights(L.newSession(plan, today)); old.sessions.push(act);
  const real = addTraining(old, today, { 'Latziehen': [[45, 12]] });
  const d = L.migrate(old); L.setDb(d);
  assert.strictEqual(d.version, L.DATA_VERSION);
  const p = d.plans[0];
  assert.deepStrictEqual(p.exercises.slice(-3).map(e => e.name + e.group), ['HammercurlsB', 'Trizeps am Turm 2B', 'Crunches am KabelzugB']);
  assert.strictEqual(p.exercises.at(-1).sets, 2); assert.strictEqual(p.exercises.at(-1).guide, null);
  const a2 = d.sessions.find(s => s.id === act.id);
  assert.strictEqual(a2.exercises.at(-1).name, 'Crunches am Kabelzug');
  assert.ok(L.isUntouched(a2), 'offenes, unberührtes Training bleibt unberührt');
  assert.strictEqual(d.sessions.find(s => s.id === real.id).exercises.length, 13, 'abgeschlossenes Training unverändert');
  assert.strictEqual(L.migrate(d).plans[0].exercises.filter(e => e.name === 'Crunches am Kabelzug').length, 1, 'nicht doppelt');
  // Supersatz B hat jetzt 3 Übungen
  assert.deepStrictEqual(L.blocks(p.exercises).at(-1).items.map(i => i.ex.name), ['Hammercurls', 'Trizeps am Turm 2', 'Crunches am Kabelzug']);
});
test('Migration Version 5 → 6: „Rudern aufrecht“ wird „Rudern sitzend“, Verlauf läuft weiter, Rücken statt Schultern', () => {
  const old = L.freshDb(); L.setDb(old);
  const plan = old.plans[0];
  const rx = plan.exercises.find(e => e.name === 'Rudern sitzend'); rx.name = 'Rudern aufrecht';
  const set = s => { const ex = s.exercises.find(e => e.name === 'Rudern sitzend' || e.name === 'Rudern aufrecht'); ex.name = 'Rudern aufrecht'; ex.key = 'rudern aufrecht'; return ex; };
  set(old.sessions[0]);
  const real = addTraining(old, today, {});
  Object.assign(set(real), { skipped: false, sets: sets([[22.5, 12], [22.5, 12], [22.5, 11]]) });
  old.version = 5; old.renames = { hackenschmidt: 'squats' };
  const d = L.migrate(old); L.setDb(d);
  assert.strictEqual(d.version, L.DATA_VERSION);
  assert.ok(d.plans[0].exercises.some(e => e.name === 'Rudern sitzend'));
  assert.deepStrictEqual(d.renames, { hackenschmidt: 'squats', 'rudern aufrecht': 'rudern sitzend' });
  assert.strictEqual(d.sessions.find(s => s.id === real.id).exercises.find(e => e.key === 'rudern aufrecht').sets[0].w, 22.5, 'Training unverändert');
  assert.strictEqual(L.exerciseHistory('rudern sitzend').length, 2);
  const n0 = L.newSession(d.plans[0], today); n0.createdAt = Date.now() + 30000;
  assert.deepStrictEqual(exOf(L.prefillWeights(n0), 'Rudern sitzend').sets.map(x => x.w), [22.5, 22.5, 22.5]);
  const load = L.planMuscleLoad(d.plans[0]).load;
  assert.strictEqual(L.muscleLevel(load.upperback), 3, 'oberer Rücken jetzt stark');
});
test('Migration Version 6 → 7: vorgebeugtes Seitheben nach Seitheben in Supersatz A', () => {
  const old = L.freshDb(); L.setDb(old);
  const drop = list => list.filter(e => e.name !== 'Vorgebeugtes Seitheben');
  old.plans[0].exercises = drop(old.plans[0].exercises);
  old.sessions[0].exercises = drop(old.sessions[0].exercises);
  old.version = 6;
  const act = L.prefillWeights(L.newSession(old.plans[0], today)); old.sessions.push(act);
  const real = addTraining(old, today, { 'Seitheben': [[5, 13]] });
  const d = L.migrate(old); L.setDb(d);
  const p = d.plans[0];
  assert.deepStrictEqual(L.blocks(p.exercises)[7].items.map(i => i.ex.name), ['Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Vorgebeugtes Seitheben']);
  const v = p.exercises.find(e => e.name === 'Vorgebeugtes Seitheben');
  assert.ok(v.perDumbbell && v.sets === 2 && v.guide === null && v.group === 'A');
  assert.strictEqual(new Set(p.exercises.map(e => e.id)).size, p.exercises.length, 'IDs eindeutig');
  const a2 = d.sessions.find(s => s.id === act.id);
  assert.strictEqual(a2.exercises[a2.exercises.findIndex(e => e.name === 'Seitheben') + 1].name, 'Vorgebeugtes Seitheben');
  assert.ok(L.isUntouched(a2));
  assert.ok(!d.sessions.find(s => s.id === real.id).exercises.some(e => e.name === 'Vorgebeugtes Seitheben'), 'abgeschlossenes Training unverändert');
  assert.strictEqual(L.exerciseHistory('vorgebeugtes seitheben').length, 0, 'eigener, neuer Verlauf');
  assert.strictEqual(L.muscleLevel(L.planMuscleLoad(p).load.reardelts), 3, 'hintere Schulter jetzt stark');
});
test('Migration Version 7 → 8: Schulterdrücken mit 2 Sätzen, Startwerte und Trainings unverändert', () => {
  const old = L.freshDb(); L.setDb(old);
  old.plans[0].exercises.find(e => e.name === 'Schulterdrücken').sets = 3;
  old.version = 7;
  const act = L.prefillWeights(L.newSession(old.plans[0], today)); old.sessions.push(act);
  assert.strictEqual(exOf(act, 'Schulterdrücken').sets.length, 3);
  const d = L.migrate(old); L.setDb(d);
  assert.strictEqual(d.plans[0].exercises.find(e => e.name === 'Schulterdrücken').sets, 2);
  const a2 = d.sessions.find(s => s.id === act.id);
  assert.deepStrictEqual(exOf(a2, 'Schulterdrücken').sets.map(x => x.w), [7.5, 7.5]);
  assert.ok(L.isUntouched(a2));
  assert.strictEqual(exOf(d.sessions.find(s => s.kind === 'baseline'), 'Schulterdrücken').sets.length, 3, 'Startwerte unverändert');
});
test('Migration Version 8 → 9: Drücken/Ziehen abwechselnd, Butterfly 2 Sätze, auch im offenen Training', () => {
  const old = L.freshDb(); L.setDb(old);
  const plan = old.plans[0];
  const ORDER8 = ['Squats', 'Kreuzheben', 'Bankdrücken mit Kurzhanteln', 'Latziehen', 'Butterfly mit Kurzhanteln', 'Rudern sitzend', 'Schulterdrücken'];
  const by = n => plan.exercises.find(e => e.name === n);
  plan.exercises = ORDER8.map(by).concat(plan.exercises.filter(e => !ORDER8.includes(e.name)));
  by('Butterfly mit Kurzhanteln').sets = 3;
  // Squats liegt im alten Training noch unter „Hackenschmidt“ (Umbenennung aus Version 4)
  old.renames = { hackenschmidt: 'squats' };
  old.version = 8;
  const act = L.prefillWeights(L.newSession(plan, today));
  act.exercises[0].key = 'hackenschmidt'; act.exercises[0].name = 'Hackenschmidt';
  act.prefill = JSON.stringify(act.exercises.map(e => e.sets.map(x => x.w)));
  old.sessions.push(act);
  const d = L.migrate(old); L.setDb(d);
  const want = ['Squats', 'Kreuzheben', 'Latziehen', 'Bankdrücken mit Kurzhanteln', 'Rudern sitzend', 'Butterfly mit Kurzhanteln', 'Schulterdrücken'];
  assert.deepStrictEqual(d.plans[0].exercises.slice(0, 7).map(e => e.name), want);
  assert.deepStrictEqual(d.plans[0].exercises.slice(7).map(e => e.group).join(''), 'AAAABBB');
  assert.strictEqual(d.plans[0].exercises[5].sets, 2);
  const a2 = d.sessions.find(s => s.id === act.id);
  assert.deepStrictEqual(a2.exercises.slice(0, 7).map(e => e.name), ['Hackenschmidt'].concat(want.slice(1)));
  assert.strictEqual(exOf(a2, 'Butterfly mit Kurzhanteln').sets.length, 2);
  assert.ok(L.isUntouched(a2));
});
test('Migration Version 9 → 10: Pausenzeiten und Ton-Einstellung', () => {
  const old = L.freshDb(); old.version = 9; delete old.settings;
  old.plans[0].exercises.forEach(e => { delete e.rest; });
  old.plans.push({ id: 'x', name: 'Eigener', exercises: [{ id: 'a', name: 'Beinpresse', sets: 3, guide: null, perDumbbell: false, group: 'A' }, { id: 'b', name: 'Wadenheben', sets: 3, guide: null, perDumbbell: false, group: 'A' }] });
  const d = L.migrate(old);
  assert.strictEqual(d.version, L.DATA_VERSION);
  assert.deepStrictEqual(d.settings, { sound: true, weeklyGoal: 3 });
  assert.strictEqual(d.plans[0].exercises[0].rest, 120);
  assert.deepStrictEqual(d.plans[1].exercises.map(e => e.rest), [120, 120], 'Supersatz: längste Pause gilt für alle');
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
