// Oberflächentest (390 × 844). Benötigt Playwright + Chromium und einen Server auf Port 8123:
//   python3 -m http.server 8123   (im Projektordner)   dann: node tests/ui.test.js [screenshot-ordner]
// Andere Adresse: APP_URL=http://localhost:9000/ node tests/ui.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.APP_URL || 'http://localhost:8123/';
const SHOTS = process.argv[2] || null;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const STORE = 'trainingsapp.v1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('Testplan') : d.accept());
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  const go = async hash => { await page.goto(URL + hash); await page.waitForTimeout(150); };
  const store = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), STORE);

  // 1. Startseite + Planauswahl
  await go('');
  ok(await page.locator('.tile').count() === 4, '1 Startseite zeigt vier Kacheln');
  ok((await page.locator('.tile .tl').allInnerTexts()).join('|') === 'Trainingspläne|Training|Fortschritt|Ausblick', '1 Kacheln in richtiger Reihenfolge');
  ok((await page.locator('.active-plan').innerText()).includes('Ganzkörperplan'), '1 Aktiver Plan angezeigt');
  ok(await page.locator('#tabbar').count() === 0, '1 Keine Tab-Leiste mehr');
  await shot(page, '1-start');
  await page.click('.tile >> text=Trainingspläne'); await page.waitForSelector('.plan-card');
  ok(await page.locator('.topbar .back').count() === 1, '1 Zurück-Button vorhanden');
  ok(await page.locator('.plan-card').first().locator('.body-svg').count() === 2, 'Körperansicht vorne und hinten beim Plan');
  ok(await page.locator('.plan-card').first().locator('[data-m="glutes"].bm-3').count() === 1 && await page.locator('.plan-card').first().locator('[data-m="calves"].bm-1').count() === 1, 'Squats & Co.: Gesäß stark, Waden leicht');
  ok((await page.locator('.plan-card').first().locator('.bm-legend').innerText()).includes('Stark: Brust'), 'Legende mit Muskelnamen');
  await page.click('button[data-act=new-plan]'); await page.waitForSelector('[data-plan-f=name]');
  await go('#/plaene');
  await page.locator('.plan-card', { hasText: 'Testplan' }).locator('.plan-pick').click();
  await page.reload(); await go('');
  ok((await page.locator('.active-plan').innerText()).includes('Testplan'), '1 Planauswahl bleibt nach Neuladen erhalten');
  await go('#/plaene');
  await page.locator('.plan-card', { hasText: 'Ganzkörperplan' }).locator('.plan-pick').click();
  ok(await page.locator('.plan-card.on', { hasText: 'Ganzkörperplan' }).count() === 1, '1 Ganzkörperplan wieder aktiv');

  // 2. Training: 12 Übungen, Startwerte als „Letztes Mal“
  await go(''); await page.click('.tile-main'); await page.waitForSelector('.ex-card');
  const names = await page.evaluate(() => [...document.querySelectorAll('.ex-card h3, .ss-li-top b')].map(e => e.textContent));
  ok(JSON.stringify(names) === JSON.stringify(['Squats', 'Kreuzheben', 'Bankdrücken mit Kurzhanteln', 'Latziehen', 'Butterfly mit Kurzhanteln',
    'Rudern sitzend', 'Schulterdrücken', 'Supersatz A', 'Bizepscurls', 'Trizeps am Turm 1', 'Seitheben', 'Vorgebeugtes Seitheben', 'Supersatz B', 'Hammercurls', 'Trizeps am Turm 2', 'Crunches am Kabelzug']), '2 14 Übungen in richtiger Reihenfolge (mit Supersatz-Karten)');
  const card = n => page.locator('.ex-card:not(.superset)', { has: page.locator('h3', { hasText: n }) });
  const latLast = await card('Latziehen').locator('.last').innerText();
  ok(/^Letztes Mal \(Startwerte, \d\d\.\d\d\.\): 45 kg × 12 \/ 12 \/ 10$/.test(latLast), '2 „Letztes Mal“ zeigt Startwerte: ' + latLast);
  ok((await card('Bankdrücken mit Kurzhanteln').innerText()).includes('pro Hantel'), '2 Hinweis „pro Hantel“');
  const kgOf = async n => card(n).locator('input[data-f=w]').evaluateAll(els => els.map(e => e.value).join('/'));
  const repsOf = async n => card(n).locator('input[data-f=r]').evaluateAll(els => els.map(e => e.value).join('/'));
  ok(await kgOf('Latziehen') === '45/45/45' && await repsOf('Latziehen') === '//', '2 kg vom letzten Mal vorausgefüllt, Wdh. leer');
  ok(await kgOf('Kreuzheben') === '42,5/42,5/42,5', '2 Kreuzheben mit 3 Sätzen, 42,5 vorausgefüllt');
  ok(await kgOf('Bankdrücken mit Kurzhanteln') === '17,5/17,5/17,5' && await kgOf('Butterfly mit Kurzhanteln') === '12,5/12,5/12,5' && await kgOf('Schulterdrücken') === '7,5/7,5/7,5', '2 Kurzhanteln pro Hantel (17,5 / 12,5 / 7,5)');
  await card('Squats').locator('.set-row').nth(0).locator('input[data-f=w]').fill('12,5');
  await card('Squats').locator('.set-row').nth(0).locator('input[data-f=w]').blur();
  ok(await kgOf('Squats') === '12,5/12,5/12,5', '2 Geändertes Gewicht wird an Folgesätze weitergegeben');
  await go(''); await page.waitForTimeout(100);
  ok(await page.locator('.tile-main .hint').count() === 1, '2 Training mit geändertem Gewicht zeigt „Weitermachen“');
  ok(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).sessions.filter(s => s.status === 'active').length, STORE) === 1, '2 Angefangenes (Gewicht geändert) bleibt gespeichert');
  await page.click('.tile-main'); await page.waitForSelector('.ex-card');

  // 3./4. Werte eintragen, Fokussprung, Dezimalgewichte
  const row = (n, j) => card(n).locator('.set-row').nth(j);
  await row('Kreuzheben', 0).locator('input[data-f=w]').fill('42,5');
  await row('Kreuzheben', 0).locator('input[data-f=r]').focus();
  await page.keyboard.type('12');
  ok(await page.evaluate(() => { const a = document.activeElement; return a.dataset.f === 'w' && a.dataset.set === '1'; }), '3 Fokus springt nach Wiederholungen ins nächste Feld');
  ok(await row('Kreuzheben', 1).locator('input[data-f=w]').inputValue() === '42,5', '3 Gewicht für Folgesatz vorgeschlagen (42,5)');
  await page.keyboard.type('10');
  await card('Latziehen').locator('[data-act=take-all]').click();
  ok(await row('Latziehen', 2).locator('input[data-f=r]').inputValue() === '10', '3 „Wie letztes Mal“ befüllt alle Sätze');
  await row('Latziehen', 2).locator('input[data-f=r]').fill('12');
  await card('Squats').locator('[data-act=take-all]').click();
  await card('Rudern sitzend').locator('[data-act=take-all]').click();
  await row('Rudern sitzend', 1).locator('input[data-f=r]').fill('11');
  await row('Schulterdrücken', 0).locator('input[data-f=w]').fill('10'); await row('Schulterdrücken', 0).locator('input[data-f=r]').fill('10');
  await row('Schulterdrücken', 1).locator('input[data-f=w]').fill('7,5'); await row('Schulterdrücken', 1).locator('input[data-f=r]').fill('12');
  await card('Bankdrücken mit Kurzhanteln').locator('[data-act=skip]').click();

  // 10. Supersatz A
  const ssA = page.locator('.superset', { has: page.locator('h3', { hasText: 'Supersatz A' }) });
  ok(await ssA.locator('.round').count() === 2, '10 Supersatz A: 2 Runden');
  ok(await ssA.locator('.round').nth(0).locator('.ss-row').count() === 4 && await ssA.locator('.round').nth(1).locator('.ss-row').count() === 4, '10 je Runde 4 Übungen');
  const order = await ssA.locator('input[data-f=w]').evaluateAll(els => els.map(e => document.querySelector(`[data-card]`) && e.closest('.ss-row').querySelector('.ss-name').textContent + e.dataset.set));
  ok(order.join(',') === 'Bizepscurls0,Trizeps am Turm 10,Seitheben0,Vorgebeugtes Seitheben0,Bizepscurls1,Trizeps am Turm 11,Seitheben1,Vorgebeugtes Seitheben1', '10 Felder in Rundenreihenfolge: ' + order.join(','));
  ok((await ssA.locator('.ss-row').first().locator('.prev-btn').innerText()).startsWith('12 × 13'), '10 Werte vom letzten Mal neben dem Feldpaar');
  const ssIn = (k, f) => ssA.locator(`input[data-f=${f}]`).nth(k);
  await ssIn(0, 'w').fill('12'); await ssIn(0, 'r').focus(); await page.keyboard.type('14');
  ok(await page.evaluate(() => document.activeElement.closest('.ss-row')?.querySelector('.ss-name').textContent) === 'Trizeps am Turm 1', '10 Fokus springt Bizeps R1 → Turm 1 R1');
  await page.keyboard.type('18');
  await ssIn(1, 'r').focus(); await page.keyboard.type('13');
  ok(await page.evaluate(() => document.activeElement.closest('.ss-row')?.querySelector('.ss-name').textContent + document.activeElement.dataset.set) === 'Seitheben0', '10 Fokus springt Turm 1 R1 → Seitheben R1');
  await ssIn(2, 'w').fill('5'); await ssIn(2, 'r').fill('13');
  await ssIn(4, 'w').fill('12'); await ssIn(4, 'r').fill('13');
  await ssIn(5, 'w').fill('18'); await ssIn(5, 'r').fill('13');
  const ssB = page.locator('.superset', { has: page.locator('h3', { hasText: 'Supersatz B' }) });
  await ssB.locator('[data-act=take-group]').click();
  ok(await ssB.locator('input[data-f=w]').first().inputValue() === '12,5', '10 „Wie letztes Mal“ befüllt ganzen Supersatz (12,5)');
  await ssB.locator('input[data-f=r]').nth(3).fill('13'); // Hammercurls R2: 13 statt 12 (R1: Hammer, Turm 2, Crunches)
  await shot(page, '2-supersatz-vor-reload');
  // 4. Neu laden
  await page.reload(); await page.waitForSelector('.ex-card');
  ok(await row('Kreuzheben', 0).locator('input[data-f=w]').inputValue() === '42,5', '4 Nach Neuladen: 42,5 noch da');
  ok(await ssA.locator('input[data-f=r]').nth(0).inputValue() === '14' && await ssA.locator('input[data-f=w]').nth(2).inputValue() === '5', '10 Nach Neuladen: Supersatz-Werte noch da');
  ok(await card('Bankdrücken mit Kurzhanteln').locator('text=Übersprungen').count() === 1, '4 Nach Neuladen: Überspringen noch da');
  // 11. Seitheben im Supersatz überspringen
  await ssA.locator('li', { has: page.locator('b', { hasText: /^Seitheben$/ }) }).locator('[data-act=skip]').click();
  ok(await ssA.locator('.round').nth(0).locator('.ss-row').count() === 3, '11 Seitheben übersprungen, Rest bleibt');
  ok(await ssA.locator('input[data-f=r]').nth(0).inputValue() === '14', '11 Bizeps-Werte unverändert');
  await shot(page, '2-training', false);
  await page.evaluate(() => document.querySelector('.superset').scrollIntoView());
  await shot(page, '2b-supersatz');
  await go('');
  ok(await page.locator('.tile-main .hint', { hasText: 'Weitermachen' }).count() === 1, '4 Kachel Training zeigt „Weitermachen“');

  // 5. Auswertung
  await page.click('.tile-main'); await page.waitForSelector('.ex-card');
  await page.click('[data-act=finish]'); await page.waitForSelector('.prow');
  const prow = n => page.locator('.prow', { has: page.locator('.pname', { hasText: new RegExp('^' + n) }) });
  const cls = async n => (await prow(n).getAttribute('class')).split(' ').find(c => c.startsWith('s-'));
  ok(await cls('Latziehen') === 's-up', '5 Grün: Latziehen');
  ok((await prow('Latziehen').innerText()).includes('45 kg × 12 statt 45 kg × 10 – zwei Wiederholungen mehr bei gleichem Gewicht'), '5 Begründung Latziehen');
  ok(await cls('Squats') === 's-same', '5 Gelb: Squats');
  ok(await cls('Rudern sitzend') === 's-down', '5 Orange: Rudern sitzend');
  ok(await cls('Schulterdrücken') === 's-up' && (await prow('Schulterdrücken').innerText()).includes('über geschätztes Maximalgewicht bewertet'), '5 Gegensätzlich: Schulterdrücken über 1RM bewertet');
  ok(await cls('Kreuzheben') === 's-same' && (await prow('Kreuzheben').innerText()).includes('42,5 kg × 12'), '3 Dezimalgewicht 42,5 in Auswertung');
  ok(await cls('Hammercurls') === 's-up' && (await prow('Hammercurls').innerText()).includes('12,5 kg × 13 statt 12,5 kg × 12'), '3 Dezimalgewicht 12,5 verglichen');
  ok(await cls('Bankdrücken mit Kurzhanteln') === 's-grey', '6 Übersprungene Übung grau, nicht orange');
  ok(await cls('Seitheben') === 's-grey', '11 Seitheben grau');
  ok(await cls('Bizepscurls') === 's-up' && await cls('Trizeps am Turm 1') === 's-same', '10/11 Bizepscurls und Turm 1 einzeln bewertet');
  ok((await page.locator('.sub').allInnerTexts()).join('|').toUpperCase() === 'SUPERSATZ A|SUPERSATZ B', '10 Zwischenüberschriften Supersatz A/B');
  await shot(page, '3-auswertung', true);

  // Nächstes Training: kg aus dem gerade abgeschlossenen Training vorausgefüllt
  await go(''); await page.click('.tile-main'); await page.waitForSelector('.ex-card');
  ok(await card('Schulterdrücken').locator('input[data-f=w]').evaluateAll(els => els.map(e => e.value).join('/')) === '10/7,5/7,5', 'Nächstes Training: kg vom letzten Training (10/7,5/7,5)');
  ok(await card('Bankdrücken mit Kurzhanteln').locator('input[data-f=w]').evaluateAll(els => els.map(e => e.value).join('/')) === '17,5/17,5/17,5', 'Übersprungene Übung: kg vom letzten echten Eintrag');
  ok(await ssA.locator('input[data-f=w]').nth(0).inputValue() === '12', 'Supersatz: kg vorausgefüllt');
  await go('');
  ok(await page.locator('.tile-main .hint').count() === 0 && (await store()).sessions.filter(s => s.status === 'active').length === 0, 'Unberührtes Training wird beim Verlassen verworfen');

  // Fortschritt
  await go('#/fortschritt');
  ok(await page.locator('.chart-wrap svg .pline').count() === 1, '4 Fortschrittsgrafik vorhanden');
  ok(await cls('Latziehen') === 's-up' && await cls('Seitheben') === 's-grey', '4 Fortschritt mit Ampel');
  await shot(page, '4-fortschritt', true);
  await prow('Latziehen').click(); await page.waitForSelector('.hist');
  ok(await page.locator('.hist tr').count() === 3 && await page.locator('.chart-wrap svg circle').count() === 2, '4 Detailansicht: Tabelle + 1RM-Grafik');
  await page.click('[data-act=chart-mode][data-m="45"]');
  ok((await page.locator('.chart-title').innerText()).includes('Wiederholungen bei 45 kg'), '4 Umschalten auf Wdh. bei 45 kg');

  // 7. Ausblick mit 2 Trainings
  await go('#/ausblick');
  ok((await page.locator('.prow', { hasText: 'Latziehen' }).innerText()).includes('Für eine Prognose brauche ich mindestens 3 Trainings.'), '7 Mit 2 Trainings: Hinweistext');
  ok((await page.locator('.note').innerText()).includes('Grobe Schätzung bei gleichbleibendem Tempo'), '7 Hinweis zur groben Schätzung sichtbar');
  ok(await page.locator('.seg button.on').innerText() === '6 Monate', '7 Standardzeitraum 6 Monate');
  // Daten zeitlich auseinanderziehen + drittes Training ergänzen
  await page.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k));
    const iso = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
    const done = d.sessions.filter(s => s.status === 'done').sort((a, b) => a.createdAt - b.createdAt);
    done[0].date = iso(-28); done[1].date = iso(-14);
    const third = JSON.parse(JSON.stringify(done[1])); third.id = 'drei'; third.date = iso(0); third.createdAt = Date.now();
    third.exercises.find(e => e.name === 'Latziehen').sets = [{ w: 47.5, r: 12 }, { w: 45, r: 12 }, { w: 45, r: 12 }];
    third.exercises.find(e => e.name === 'Hammercurls').sets = [{ w: 13, r: 13 }, { w: 12.5, r: 13 }];
    third.exercises.find(e => e.name === 'Kreuzheben').sets = [{ w: 60, r: 12 }, { w: 60, r: 12 }];
    d.sessions.push(third); localStorage.setItem(k, JSON.stringify(d));
  }, STORE);
  await page.reload(); await page.waitForSelector('.prow');
  const latF = await page.locator('.prow', { hasText: 'Latziehen' }).locator('.ptext').innerText();
  ok(/^in 6 Monaten ca\. \d+(,5)? kg × 12 \(heute 47,5 kg × 12\)$/.test(latF), '7 Plausible, gerundete Prognose: ' + latF);
  const hamF = await page.locator('.prow', { hasText: 'Hammercurls' }).locator('.ptext').innerText();
  ok(/ca\. \d+ kg × 13/.test(hamF), '7 Kurzhantel auf 1 kg gerundet: ' + hamF);
  const kh = await page.locator('.prow', { hasText: 'Kreuzheben' }).innerText();
  ok(kh.includes('gedeckelt'), '7 Deckelung bei Kreuzheben angezeigt');
  ok(await page.locator('.chart-wrap svg .fline').count() === 1, '7 Prognose gestrichelt in Grafik');
  ok(/[+−]\d/.test(await page.locator('.chart-title b').innerText()), '7 Gesamtprognose in Prozent');
  await shot(page, '5-ausblick', true);
  await page.click('[data-act=period][data-d="30"]');
  ok((await page.locator('.prow', { hasText: 'Latziehen' }).locator('.ptext').innerText()).startsWith('in 1 Monat'), '7 Zeitraum 1 Monat umschaltbar');
  await page.locator('.prow', { hasText: 'Latziehen' }).click(); await page.waitForSelector('.fline');
  ok(true, '7 Detailansicht mit gestrichelter Prognose');

  // Korrigieren & Löschen abgeschlossener Trainings
  await go('#/trainings');
  ok(await page.locator('.card.link').count() === 3 && await page.locator('.tag', { hasText: 'Startwerte' }).count() === 1, 'Alle Trainings inkl. Startwerte gelistet');
  await page.locator('.card.link').first().click(); await page.waitForSelector('.prow');
  await page.click('text=Training korrigieren'); await page.waitForSelector('.ex-card');
  await page.click('[data-act=delete-session]'); await page.waitForTimeout(200);
  ok(await page.locator('.card.link').count() === 2, 'Abgeschlossenes Training gelöscht');

  // Plan bearbeiten: Supersatz auflösen/bilden, alte Trainings unverändert
  const before = JSON.stringify((await store()).sessions);
  await go('#/plan/plan-ganzkoerper-v2');
  await page.locator('[data-act=unlink][data-group=B]').click();
  ok(await page.locator('.plan-group').count() === 1, 'Supersatz B aufgelöst');
  await page.locator('.plan-ex', { hasText: 'Hammercurls' }).locator('[data-act=link]').click();
  ok(await page.locator('.plan-group').count() === 2, 'Supersatz wieder gebildet');
  await page.locator('.plan-group').first().locator('.plan-ex').nth(0).locator('[data-act=move-in][data-d="1"]').click();
  const p = (await store()).plans[0];
  ok(p.exercises.slice(7).map(e => e.name + (e.group || '')).join(',') === 'Trizeps am Turm 1A,BizepscurlsA,SeithebenA,Vorgebeugtes SeithebenA,HammercurlsB,Trizeps am Turm 2B,Crunches am Kabelzug', 'Reihenfolge im Supersatz geändert');
  // Umbenennen mit Rückfrage: Verlauf weiterführen (Dialog wird im Test bestätigt)
  await page.locator('.plan-ex a', { hasText: 'Latziehen' }).click(); await page.waitForSelector('[data-slot=name]');
  await page.locator('[data-slot=name]').focus();
  await page.locator('[data-slot=name]').fill('Latzug breit');
  await page.locator('[data-slot=name]').blur(); await page.waitForTimeout(150);
  ok(JSON.stringify((await store()).renames) === JSON.stringify({ 'latziehen': 'latzug breit' }), 'Umbenennen: Verlauf wird weitergeführt');
  ok(JSON.stringify((await store()).sessions) === before, 'Planänderung verändert gespeicherte Trainings nicht');
  await go('#/fortschritt');
  ok(await cls('Latzug breit') === 's-up', 'Umbenannte Übung behält ihre Bewertung');
  await go('#/training'); await page.waitForSelector('.ex-card');
  ok((await card('Latzug breit').locator('.last').innerText()).startsWith('Letztes Mal als Latziehen'), '„Letztes Mal als Latziehen“ angezeigt');
  ok(await card('Latzug breit').locator('input[data-f=w]').first().inputValue() === '45', 'kg vom alten Namen vorausgefüllt');
  await go('');
  await go('#/plan/plan-ganzkoerper-v2');
  await shot(page, '6-plan', true);

  // 9. Export → Import
  await go('#/plaene');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const file = await dl.path();
  const exported = await store();
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await go('#/plaene');
  await page.setInputFiles('input[data-act=import]', file); await page.waitForTimeout(300);
  ok(JSON.stringify(await store()) === JSON.stringify(exported), '9 Export → Import ergibt denselben Datenstand');

  // Offline
  await go(''); await page.waitForTimeout(800);
  await ctx.setOffline(true); await page.reload();
  ok(await page.locator('.tile').count() === 4, 'App lädt offline');
  await ctx.setOffline(false);

  // 8. Migration Version 1 in frischem Kontext
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p2 = await ctx2.newPage();
  let err2 = 0; p2.on('pageerror', e => { console.log('PAGEERROR', e.message); err2++; });
  await p2.goto(URL);
  const v1 = JSON.parse(fs.readFileSync(__dirname + '/v1-sample.json', 'utf8'));
  await p2.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [STORE, v1]);
  await p2.reload(); await p2.waitForSelector('.tile');
  const d2 = await p2.evaluate(k => JSON.parse(localStorage.getItem(k)), STORE);
  ok(err2 === 0 && d2.version === 7 && d2.sessions.some(s => s.id === 'old1'), '8 Version-1-Daten laden ohne Fehler, alte Trainings erhalten');
  await p2.goto(URL + '#/fortschritt'); await p2.waitForSelector('.prow');
  ok(await p2.locator('h2', { hasText: 'Weitere Übungen' }).count() === 1, '8 Alte Übungen bleiben als „Weitere Übungen“ erreichbar');
  await p2.goto(URL + '#/fortschritt/uebung/latziehen'); await p2.waitForSelector('.hist');
  ok(await p2.locator('.hist tr').count() === 3, '8 Alter Latziehen-Eintrag in Detailansicht');

  console.log(fails ? `\n${fails} FEHLER` : '\nAlle UI-Tests bestanden');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
