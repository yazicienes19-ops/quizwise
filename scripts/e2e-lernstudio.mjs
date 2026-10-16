// E2E Lernstudio v2 (Zusammenfassung, Pro) in der echten Oberfläche.
// Legt ein Wegwerf-Konto per Service-Key an (Pro, ein Fach mit der PDF, eine
// absichtlich unvollständige alte v2-Zusammenfassung) und löscht es am Ende.
// Aufruf (App mit VITE_BACKEND_URL auf ein laufendes Backend):
//   set -a; . backend/.env; set +a; APP=http://localhost:3001 PDF=… OUT=… node scripts/e2e-lernstudio.mjs
// Die PDF liegt nur lokal (benchmark/datasets/lernstudio/, gitignored).
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP ?? 'http://localhost:3001';
const OUT = process.env.OUT;
const PDF = process.env.PDF;
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const email = `e2e-studio-${Date.now()}@studearc.test`;
const password = 'E2e-Studio-' + crypto.randomBytes(6).toString('hex');
const ok = m => console.log('✓', m); const bad = m => console.log('✗', m);

const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (cErr) { console.log('createUser FEHLER', cErr.message); process.exit(1); }
const uid = created.user.id;
const colId = 'e2ecol' + crypto.randomBytes(3).toString('hex');
const docId = crypto.randomUUID();
const storagePath = `${uid}/${docId}/gesamt.pdf`;

const cleanup = async () => {
  await admin.storage.from('document-files').remove([storagePath]).catch(() => {});
  const { error } = await admin.auth.admin.deleteUser(uid);
  console.log(error ? 'Löschen FEHLER ' + error.message : 'Testkonto gelöscht');
};

const browser = await chromium.launch();
try {
  // ── Daten anlegen ──
  // Pro, Onboarding erledigt (neue Konten bekommen es sonst als Vollbild-Dialog, hooks/useAuth.ts).
  await admin.from('profiles').update({ plan: 'pro', preferences: { onboarding_done: true } }).eq('id', uid);
  const plan = (await admin.from('profiles').select('plan').eq('id', uid).single()).data?.plan;
  plan === 'pro' ? ok('Testkonto ist Pro') : bad(`Testkonto-Plan: ${plan}`);
  await admin.from('collections').insert({ id: colId, user_id: uid, name: 'Allgemeine Psychologie 1', emoji: '🧠', color: '#6366f1', folders: [] });
  const up = await admin.storage.from('document-files').upload(storagePath, readFileSync(PDF), { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error('Upload: ' + up.error.message);
  const ins = await admin.from('documents').insert({
    id: docId, user_id: uid, name: 'Allgemeine Psychologie 1 (gesamt)', file_type: 'pdf', mime_type: 'application/pdf',
    collection_id: colId, storage_path: storagePath, upload_date: Date.now(), status: 'ready',
  });
  if (ins.error) throw new Error('Dokument: ' + ins.error.message);
  // Alte v2-Zusammenfassung wie im Testlauf vom 16.10.: leere Kapitelüberschrift, Studie ohne Aufbau mit kaputtem Jahr.
  const oldContent = {
    formatVersion: 2, format: 'zusammenfassung', omittedSources: [], warnings: [], stats: { sourceWords: 5000, outputWords: 40 },
    blocks: [
      { id: 'c1-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Aufmerksamkeit: Phänomene' },
      { id: 'c1-1', origin: 'quelle', cites: [], type: 'heading', level: 3, text: 'Grundlagen' },
      { id: 'c2-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Modelle der Selektion' },
      { id: 'c2-1', origin: 'quelle', cites: [], type: 'study', authors: 'Moray', year: 1959591959, design: '', result: '', conclusion: '' },
    ],
  };
  const now = new Date(Date.now() - 3600_000).toISOString();
  const old = await admin.from('studio_items').insert({
    id: crypto.randomUUID(), user_id: uid, collection_id: colId, kind: 'summary', title: 'Zusammenfassung (alt)',
    markdown: '### Aufmerksamkeit', sources: [{ n: 1, docId, name: 'Allgemeine Psychologie 1 (gesamt)' }], focus: null,
    created_at: now, updated_at: now, content: oldContent, format_version: 2, idempotency_key: null,
  });
  if (old.error) throw new Error('Altes Ergebnis: ' + old.error.message);

  // ── Anmelden ──
  const init = () => { try { localStorage.setItem('studearc_onboarding_done', 'true'); localStorage.setItem('cookie_consent', 'accepted'); } catch {} };
  const c0 = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'de-DE' });
  await c0.addInitScript(init);
  const p = await c0.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const consoleLog = []; p.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleLog.push(`${msg.type()}: ${msg.text().slice(0, 300)}`); });
  await p.goto(APP); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Anmelden' }).first().click(); await p.waitForTimeout(600);
  await p.getByPlaceholder(/mail/i).first().fill(email); await p.locator('input[type=password]').first().fill(password);
  await p.getByRole('button', { name: /^Einloggen$/ }).last().click(); await p.waitForTimeout(6000);
  await p.screenshot({ path: `${OUT}/00-nach-login.png` });

  // ── Bibliothek → Fach → Lernstudio ──
  await p.getByRole('button', { name: /^Bibliothek/ }).first().click(); await p.waitForTimeout(1500);
  await p.getByText('Allgemeine Psychologie 1', { exact: true }).filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Lernstudio öffnen' }).filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/01-lernstudio-start.png` });

  // ── Alte Zusammenfassung: Hinweis "Unvollständig" ──
  await p.getByText('Zusammenfassung (alt)').first().click(); await p.waitForTimeout(1200);
  (await p.getByText(/Unvollständig, neu erstellen/).count()) ? ok('Alte Zusammenfassung: "Unvollständig, neu erstellen" in der Liste') : bad('Alte Zusammenfassung: Hinweis in der Liste fehlt');
  (await p.getByText(/Diese Zusammenfassung ist unvollständig/).count()) ? ok('Alte Zusammenfassung: Hinweis-Kasten mit "Neu erstellen"') : bad('Alte Zusammenfassung: Hinweis-Kasten fehlt');
  await p.screenshot({ path: `${OUT}/02-alte-zusammenfassung-unvollstaendig.png` });

  // ── Neu erstellen, mit Doppelklick ──
  await p.getByRole('button', { name: 'Neues erstellen' }).first().click().catch(() => {}); await p.waitForTimeout(1000);
  await p.getByText('Zusammenfassung', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(600);
  // Quelle anhaken (Checkbox neben dem Dokument).
  await p.getByRole('checkbox').filter({ visible: true }).first().check(); await p.waitForTimeout(500);
  const create = p.getByRole('button', { name: /Zusammenfassung erstellen/ }).first();
  await p.screenshot({ path: `${OUT}/03-vor-erstellen.png` });
  const before = (await admin.from('studio_items').select('id').eq('user_id', uid).eq('kind', 'summary')).data?.length ?? 0;
  await create.dblclick();
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${OUT}/03b-nach-klick.png` });
  console.log('Nach Klick:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').match(/(Lese|Erstelle|Schreibe|Prüfe|PDF|Seite \d+ von|Fehler|nicht)[^.]{0,120}/g)?.slice(0, 5).join(' | ') ?? '–');
  const t0 = Date.now();
  let item = null;
  while (Date.now() - t0 < 12 * 60_000) {
    await p.waitForTimeout(10_000);
    const rows = (await admin.from('studio_items').select('id,title,format_version,content,created_at').eq('user_id', uid).eq('kind', 'summary').eq('format_version', 2).order('created_at', { ascending: false })).data ?? [];
    item = rows.find(r => r.title !== 'Zusammenfassung (alt)' && r.content?.blocks?.length);
    if (item) break;
    await p.screenshot({ path: `${OUT}/04-fortschritt.png` });
    if (Date.now() - t0 > 90_000 && !(await p.getByText(/Quellen lesen|Gliederung|Schreiben|Prüfen|Lese|PDF/).count())) { console.log('Kein Fortschritt sichtbar. Konsole:', consoleLog.slice(-15).join('\n  ')); break; }
  }
  if (!item) { console.log('Konsole:', consoleLog.slice(-15).join('\n  ')); throw new Error('Keine neue Zusammenfassung nach 12 Minuten'); }
  console.log(`Erstellt in ${Math.round((Date.now() - t0) / 1000)} s`);
  await p.waitForTimeout(4000);
  const after = (await admin.from('studio_items').select('id').eq('user_id', uid).eq('kind', 'summary')).data?.length ?? 0;
  after - before === 1 ? ok('Doppelklick: genau ein neuer Eintrag') : bad(`Doppelklick: ${after - before} neue Einträge`);

  // ── Ergebnis: Kästen ──
  const blocks = item.content.blocks;
  const variants = [...new Set(blocks.filter(b => b.type === 'callout').map(b => b.variant))];
  console.log('Kästen im Ergebnis:', variants.join(', ') || 'keine', '| Tabellen:', blocks.filter(b => b.type === 'table').length);
  for (const [label, file] of [['Merksatz', '05-merksatz'], ['Klausurfalle', '06-klausurfalle'], ['Hinweis', '07-hinweis']]) {
    const box = p.locator('div.rounded-xl', { has: p.locator('p', { hasText: new RegExp(`^${label}`, 'i') }) }).first();
    if (await box.count()) {
      await box.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
      const border = await box.evaluate(el => getComputedStyle(el).borderLeftWidth);
      parseFloat(border) >= 2 ? ok(`${label}: als Kasten (Rand ${border})`) : bad(`${label}: kein Kasten (${border})`);
      await box.screenshot({ path: `${OUT}/${file}.png` });
    } else if (variants.includes(label.toLowerCase())) bad(`${label}: im Ergebnis, aber nicht sichtbar`);
    else console.log(`– ${label}: kommt in diesem Ergebnis nicht vor`);
  }
  await p.screenshot({ path: `${OUT}/08-ergebnis-desktop.png` });

  // ── Handybreite 390 px (dasselbe Ergebnis, Fenster verkleinert): Tabellen scrollen, nichts läuft über ──
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/11-handy-ergebnis.png` });
  // Alle Tabellen: jede bleibt im Bildschirm; die breiteste muss horizontal scrollen können.
  const tables = await p.locator('table').evaluateAll(ts => ts.map((t, i) => {
    const box = t.parentElement; const r = box.getBoundingClientRect();
    return { i, scroll: box.scrollWidth, client: box.clientWidth, overflowX: getComputedStyle(box).overflowX, left: Math.round(r.left), right: Math.round(r.right) };
  }));
  console.log('Tabellen 390 px:', JSON.stringify(tables));
  const vw = await p.evaluate(() => innerWidth);
  tables.length ? ok(`${tables.length} Tabellen gefunden`) : bad('Handy: keine Tabelle');
  tables.every(t => t.right <= vw + 1 && t.left >= -1) ? ok('Alle Tabellen bleiben innerhalb des Bildschirms') : bad('Eine Tabelle läuft über den Rand');
  tables.every(t => t.overflowX === 'auto' || t.overflowX === 'scroll') ? ok('Alle Tabellen haben einen eigenen Scrollbereich') : bad('Tabelle ohne Scrollbereich');
  const doc = await p.evaluate(() => document.documentElement.scrollWidth);
  doc <= vw + 1 ? ok('Seite: kein horizontales Überlaufen') : bad(`Seite ist ${doc} px breit`);
  const wide = [...tables].sort((a, b) => (b.scroll - b.client) - (a.scroll - a.client))[0];
  if (wide && wide.scroll > wide.client) {
    const t = p.locator('table').nth(wide.i);
    await t.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/12-handy-tabelle.png` });
    const moved = await t.evaluate(el => { el.parentElement.scrollLeft = 1000; return el.parentElement.scrollLeft; });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/13-handy-tabelle-gescrollt.png` });
    moved > 0 ? ok(`Breiteste Tabelle (${wide.scroll} px in ${wide.client} px) scrollt horizontal`) : bad('Breite Tabelle scrollt nicht');
    const sticky = await t.evaluate(el => getComputedStyle(el.querySelector('td')).position);
    console.log('Erste Spalte beim Scrollen:', sticky);
  } else console.log('– keine Tabelle breiter als der Bildschirm (alle brechen um)');
  const mCallout = p.locator('div.rounded-xl', { has: p.locator('p', { hasText: /^Merksatz/i }) }).filter({ visible: true }).first();
  if (await mCallout.count()) { await mCallout.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/14-handy-merksatz.png` }); }
  await p.setViewportSize({ width: 1400, height: 950 }); await p.waitForTimeout(1200);

  // ── Fußnote öffnet die richtige Folie ──
  const chip = p.locator('span.align-super button').filter({ hasText: /F\. \d+/ }).first();
  if (await chip.count()) {
    const label = (await chip.textContent()) ?? '';
    const title = (await chip.getAttribute('title')) ?? '';
    await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/09-fussnote-auswahl.png` });
    const want = Number(title.match(/gesamt S\. (\d+)/)?.[1]);
    console.log(`Fußnote: "${label}", Tooltip "${title}"`);
    await p.getByRole('button', { name: /^Folie \d+ \(S\. \d+\)$/ }).first().click(); await p.waitForTimeout(4000);
    await p.screenshot({ path: `${OUT}/10-reader-nach-fussnote.png` });
    const pageInput = await p.locator('input[type=number]').first().inputValue().catch(() => '');
    const shown = Number(pageInput) || Number((await p.getByText(/Seite \d+ (von|\/)/).first().textContent().catch(() => ''))?.match(/\d+/)?.[0]);
    shown === want ? ok(`Fußnote öffnet Seite ${want}`) : bad(`Fußnote: erwartet Seite ${want}, angezeigt ${shown || 'unbekannt'}`);
  } else bad('Keine Fußnote mit Folie gefunden');

  errors.length ? bad(`JS-Fehler: ${errors.slice(0, 3).join(' | ')}`) : ok('keine JS-Fehler');
} catch (e) {
  bad('Abbruch: ' + e.message);
} finally {
  await browser.close();
  await cleanup();
}
