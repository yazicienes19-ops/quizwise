// E2E Lernstudio Format „Lernleitfaden“ (Phase A) in der echten Oberfläche.
// Wegwerf-Konto (Pro) per Service-Key: Leitfaden über die Pipeline erstellen,
// Aufbau, Selbsttest (eine Antwort prüfen lassen), Handy. Konto wird am Ende gelöscht.
// Aufruf (App mit VITE_BACKEND_URL auf ein laufendes Backend):
//   set -a; . backend/.env; set +a; APP=http://localhost:3001 PDF=… OUT=… node scripts/e2e-lernstudio-leitfaden.mjs
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
const ok = m => console.log('✓', m); const bad = m => console.log('✗', m);
const accounts = [];

/** Wegwerf-Konto mit einem Fach und der PDF. */
const makeAccount = async plan => {
  const email = `e2e-leitfaden-${plan}-${Date.now()}@studearc.test`;
  const password = 'E2e-Leitfaden-' + crypto.randomBytes(6).toString('hex');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const uid = data.user.id;
  const docId = crypto.randomUUID();
  const storagePath = `${uid}/${docId}/gesamt.pdf`;
  accounts.push({ uid, storagePath });
  await admin.from('profiles').update({ plan, preferences: { onboarding_done: true } }).eq('id', uid);
  const colId = 'e2ecol' + crypto.randomBytes(3).toString('hex');
  await admin.from('collections').insert({ id: colId, user_id: uid, name: 'Allgemeine Psychologie 1', emoji: '🧠', color: '#6366f1', folders: [] });
  const up = await admin.storage.from('document-files').upload(storagePath, readFileSync(PDF), { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error('Upload: ' + up.error.message);
  const ins = await admin.from('documents').insert({
    id: docId, user_id: uid, name: 'Allgemeine Psychologie 1 (gesamt)', file_type: 'pdf', mime_type: 'application/pdf',
    collection_id: colId, storage_path: storagePath, upload_date: Date.now(), status: 'ready',
  });
  if (ins.error) throw new Error('Dokument: ' + ins.error.message);
  return { uid, email, password };
};

const cleanup = async () => {
  for (const a of accounts) {
    await admin.storage.from('document-files').remove([a.storagePath]).catch(() => {});
    const { error } = await admin.auth.admin.deleteUser(a.uid);
    console.log(error ? 'Löschen FEHLER ' + error.message : 'Testkonto gelöscht');
  }
};

const init = () => { try { localStorage.setItem('studearc_onboarding_done', 'true'); localStorage.setItem('cookie_consent', 'accepted'); } catch {} };

/** Anmelden und das Lernstudio des Fachs öffnen. */
const openStudio = async (browser, acc, errors) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'de-DE' });
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(APP); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Anmelden' }).first().click(); await p.waitForTimeout(600);
  await p.getByPlaceholder(/mail/i).first().fill(acc.email); await p.locator('input[type=password]').first().fill(acc.password);
  await p.getByRole('button', { name: /^Einloggen$/ }).last().click(); await p.waitForTimeout(6000);
  await p.getByRole('button', { name: /^Bibliothek/ }).first().click(); await p.waitForTimeout(1500);
  await p.getByText('Allgemeine Psychologie 1', { exact: true }).filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Lernstudio öffnen' }).filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
  return p;
};

const guideCard = p => p.locator('button[aria-pressed]', { hasText: /^Lernleitfaden/ }).first();

const browser = await chromium.launch();
try {
  const pro = await makeAccount('pro');
  const errors = [];
  const p = await openStudio(browser, pro, errors);
  await p.getByRole('button', { name: 'Neues erstellen' }).first().click().catch(() => {}); await p.waitForTimeout(800);
  await guideCard(p).click(); await p.waitForTimeout(600);
  await p.getByRole('checkbox').filter({ visible: true }).first().check(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/g01-vor-erstellen.png` });
  await p.getByRole('button', { name: /Lernleitfaden erstellen/ }).first().dblclick();
  const t0 = Date.now();
  let item = null;
  while (Date.now() - t0 < 12 * 60_000) {
    await p.waitForTimeout(10_000);
    const rows = (await admin.from('studio_items').select('id,title,kind,format_version,content').eq('user_id', pro.uid).order('created_at', { ascending: false })).data ?? [];
    item = rows.find(r => r.kind === 'guide' && r.format_version === 2 && r.content?.blocks?.length);
    if (item) break;
    await p.screenshot({ path: `${OUT}/g02-fortschritt.png` });
  }
  if (!item) throw new Error('Kein Leitfaden nach 12 Minuten gespeichert');
  console.log(`Gespeichert in ${Math.round((Date.now() - t0) / 1000)} s: "${item.title}", format ${item.content.format}`);
  await p.waitForTimeout(4000);
  const all = (await admin.from('studio_items').select('id').eq('user_id', pro.uid).eq('kind', 'guide')).data ?? [];
  all.length === 1 ? ok('Doppelklick: genau ein Leitfaden gespeichert') : bad(`Doppelklick: ${all.length} Leitfäden`);
  item.content.format === 'leitfaden' ? ok('Gespeichert als format „leitfaden“ (Pipeline), kind „guide“') : bad(`Format: ${item.content.format}`);
  const st = item.content.stats;
  console.log(`Haupttext ${st.mainWords} von ${st.sourceWords} (${Math.round(st.mainWords / st.sourceWords * 100)} %), Prüfhinweise ${item.content.warnings.length}`);
  for (const w of item.content.warnings) console.log('  Hinweis:', w.slice(0, 200));

  await p.screenshot({ path: `${OUT}/g03-leitfaden-desktop.png` });
  for (const h of ['Kernbegriffe', 'Verständnisfragen', 'Typische Klausurfragen']) {
    (await p.getByRole('heading', { name: h, exact: true }).count()) ? ok(`Abschnitt „${h}“ sichtbar`) : bad(`Abschnitt „${h}“ fehlt`);
  }
  (await p.locator('table').count()) ? ok('Kernbegriffe als Tabelle') : bad('Keine Tabelle');
  (await p.getByText(/Verständnisfragen zum Selbsttest/).count()) ? ok('Selbsttest-Hinweis oben') : bad('Selbsttest-Hinweis fehlt');
  (await p.getByText('Kurz gecheckt', { exact: true }).count()) ? bad('„Kurz gecheckt“ im Leitfaden') : ok('Kein „Kurz gecheckt“ im Leitfaden');

  // Selbsttest: eine Antwort prüfen lassen
  const box = p.getByPlaceholder('Deine Antwort in eigenen Worten').first();
  await box.scrollIntoViewIfNeeded();
  await box.fill('Ich weiß es nicht genau, vermutlich hat es etwas mit Aufmerksamkeit zu tun.');
  await p.getByRole('button', { name: 'Antwort prüfen' }).first().click();
  await p.waitForTimeout(15_000);
  const progress = await p.getByText(/1 von \d+ beantwortet/).count();
  progress ? ok('Selbsttest bewertet die Antwort (Stand „1 von n beantwortet“)') : bad('Selbsttest: keine Bewertung sichtbar');
  await box.locator('xpath=ancestor::div[contains(@class,"rounded")][1]').screenshot({ path: `${OUT}/g04-selbsttest.png` }).catch(() => {});
  await p.getByRole('button', { name: 'Musterantwort zeigen' }).first().click().catch(() => {}); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/g05-musterantwort.png` });

  // Fußnote
  const chip = p.locator('sup button').first();
  if (await chip.count()) { await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(500); (await p.getByText(/^Fußnote 1 ·/).count()) ? ok('Fußnote 1 zeigt die Leiste') : bad('Fußnote: keine Leiste'); }
  else bad('Keine Fußnote');

  // Handy
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500);
  const vw = await p.evaluate(() => innerWidth);
  const docW = await p.evaluate(() => document.documentElement.scrollWidth);
  docW <= vw + 1 ? ok('Handy: kein horizontales Überlaufen') : bad(`Handy: Seite ist ${docW} px breit`);
  const tbl = p.locator('table').first();
  if (await tbl.count()) { await tbl.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/g06-handy-tabelle.png` }); }
  const q2 = p.getByPlaceholder('Deine Antwort in eigenen Worten').nth(1);
  if (await q2.count()) { await q2.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/g07-handy-frage.png` }); }
  errors.length ? bad(`JS-Fehler: ${errors.slice(0, 3).join(' | ')}`) : ok('keine JS-Fehler');
} catch (e) {
  bad('Abbruch: ' + e.message);
} finally {
  await browser.close();
  await cleanup();
}
