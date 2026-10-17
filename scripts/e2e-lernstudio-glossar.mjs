// E2E Lernstudio Format „Glossar“ (Phase A) in der echten Oberfläche.
// Wegwerf-Konto (Pro) per Service-Key: Glossar über die Pipeline erstellen,
// alphabetisch mit Buchstaben, Fußnoten, Handy. Konto wird am Ende gelöscht.
// Aufruf (App mit VITE_BACKEND_URL auf ein laufendes Backend):
//   set -a; . backend/.env; set +a; APP=http://localhost:3001 PDF=… OUT=… node scripts/e2e-lernstudio-glossar.mjs
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
  const email = `e2e-glossar-${plan}-${Date.now()}@studearc.test`;
  const password = 'E2e-Glossar-' + crypto.randomBytes(6).toString('hex');
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

const card = p => p.locator('button[aria-pressed]', { hasText: /^Glossar/ }).first();

const browser = await chromium.launch();
try {
  const pro = await makeAccount('pro');
  const errors = [];
  const p = await openStudio(browser, pro, errors);
  await p.getByRole('button', { name: 'Neues erstellen' }).first().click().catch(() => {}); await p.waitForTimeout(800);
  await card(p).click(); await p.waitForTimeout(600);
  await p.getByRole('checkbox').filter({ visible: true }).first().check(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Glossar erstellen/ }).first().dblclick();
  const t0 = Date.now();
  let item = null;
  while (Date.now() - t0 < 12 * 60_000) {
    await p.waitForTimeout(10_000);
    const rows = (await admin.from('studio_items').select('id,title,kind,format_version,content').eq('user_id', pro.uid).order('created_at', { ascending: false })).data ?? [];
    item = rows.find(r => r.kind === 'glossary' && r.format_version === 2 && r.content?.blocks?.length);
    if (item) break;
  }
  if (!item) throw new Error('Kein Glossar nach 12 Minuten gespeichert');
  console.log(`Gespeichert in ${Math.round((Date.now() - t0) / 1000)} s: "${item.title}", format ${item.content.format}`);
  await p.waitForTimeout(4000);
  const all = (await admin.from('studio_items').select('id').eq('user_id', pro.uid).eq('kind', 'glossary')).data ?? [];
  all.length === 1 ? ok('Doppelklick: genau ein Glossar gespeichert') : bad(`Doppelklick: ${all.length} Glossare`);
  item.content.format === 'glossar' ? ok('Gespeichert als format „glossar“ (Pipeline)') : bad(`Format: ${item.content.format}`);
  const terms = item.content.blocks.filter(b => b.type === 'table').flatMap(b => b.rows.map(r => r[0]));
  console.log(`${terms.length} Begriffe, Prüfhinweise ${item.content.warnings.length}`);
  for (const w of item.content.warnings) console.log('  Hinweis:', w.slice(0, 200));
  await p.screenshot({ path: `${OUT}/l01-glossar-desktop.png` });
  const letters = await p.getByRole('heading', { level: 4 }).allTextContents();
  const single = letters.filter(l => /^[A-Z#]$/.test(l.trim()));
  single.length >= 5 ? ok(`Buchstaben-Überschriften: ${single.join(' ')}`) : bad(`Buchstaben: ${letters.slice(0, 10).join(',')}`);
  const sorted = single.every((l, i) => i === 0 || single[i - 1] <= l);
  sorted ? ok('Buchstaben in Reihenfolge') : bad('Buchstaben nicht sortiert');
  (await p.locator('table').count()) >= 5 ? ok(`${await p.locator('table').count()} Tabellen`) : bad('Zu wenige Tabellen');
  const chip = p.locator('sup button').first();
  if (await chip.count()) { await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(500); (await p.getByText(/^Fußnote 1 ·/).count()) ? ok('Fußnote 1 zeigt die Leiste') : bad('Fußnote: keine Leiste'); }
  else bad('Keine Fußnote');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500);
  const vw = await p.evaluate(() => innerWidth);
  const docW = await p.evaluate(() => document.documentElement.scrollWidth);
  docW <= vw + 1 ? ok('Handy: kein horizontales Überlaufen') : bad(`Handy: Seite ist ${docW} px breit`);
  const tbl = p.locator('table').nth(1);
  if (await tbl.count()) { await tbl.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/l02-handy.png` }); }
  errors.length ? bad(`JS-Fehler: ${errors.slice(0, 3).join(' | ')}`) : ok('keine JS-Fehler');
} catch (e) {
  bad('Abbruch: ' + e.message);
} finally {
  await browser.close();
  await cleanup();
}
