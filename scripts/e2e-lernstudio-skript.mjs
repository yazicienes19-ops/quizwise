// E2E Lernstudio Format „Skript“ (Phase 2) in der echten Oberfläche.
// Zwei Wegwerf-Konten per Service-Key: Free (Skript gesperrt) und Pro (Skript
// erstellen, Aufbau prüfen). Beide werden am Ende gelöscht.
// Aufruf (App mit VITE_BACKEND_URL auf ein laufendes Backend):
//   set -a; . backend/.env; set +a; APP=http://localhost:3001 PDF=… OUT=… node scripts/e2e-lernstudio-skript.mjs
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
  const email = `e2e-skript-${plan}-${Date.now()}@studearc.test`;
  const password = 'E2e-Skript-' + crypto.randomBytes(6).toString('hex');
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

const scriptCard = p => p.locator('button[aria-pressed]', { hasText: /^Skript/ }).first();

const browser = await chromium.launch();
try {
  // ── Free: Skript sichtbar, aber gesperrt ──
  const free = await makeAccount('free');
  const freeErrors = [];
  const f = await openStudio(browser, free, freeErrors);
  await f.getByRole('button', { name: 'Neues erstellen' }).first().click().catch(() => {}); await f.waitForTimeout(800);
  await scriptCard(f).click(); await f.waitForTimeout(600);
  await f.getByRole('checkbox').filter({ visible: true }).first().check().catch(() => {}); await f.waitForTimeout(400);
  (await scriptCard(f).getByText('Nur mit Pro').count()) ? ok('Free: Karte „Skript“ zeigt „Nur mit Pro“') : bad('Free: Hinweis „Nur mit Pro“ fehlt');
  (await f.getByText(/Das Skript gibt es mit Pro/).count()) ? ok('Free: Hinweiszeile unter den Optionen') : bad('Free: Hinweiszeile fehlt');
  const freeBtn = f.getByRole('button', { name: /Skript erstellen/ }).first();
  (await freeBtn.isDisabled()) ? ok('Free: „Skript erstellen“ ist gesperrt') : bad('Free: „Skript erstellen“ ist klickbar');
  await f.screenshot({ path: `${OUT}/s01-free-gesperrt.png` });
  freeErrors.length ? bad(`Free: JS-Fehler ${freeErrors.slice(0, 2).join(' | ')}`) : ok('Free: keine JS-Fehler');
  await f.context().close();

  // ── Pro: Skript erstellen ──
  const pro = await makeAccount('pro');
  const errors = [];
  const p = await openStudio(browser, pro, errors);
  await p.screenshot({ path: `${OUT}/s02-pro-start.png` });
  await p.getByRole('button', { name: 'Neues erstellen' }).first().click().catch(() => {}); await p.waitForTimeout(800);
  await scriptCard(p).click(); await p.waitForTimeout(600);
  (await scriptCard(p).getByText('Nur mit Pro').count()) ? bad('Pro: Karte zeigt trotzdem „Nur mit Pro“') : ok('Pro: Karte ohne Sperrhinweis');
  await p.getByRole('checkbox').filter({ visible: true }).first().check(); await p.waitForTimeout(500);
  const create = p.getByRole('button', { name: /Skript erstellen/ }).first();
  (await create.isEnabled()) ? ok('Pro: „Skript erstellen“ ist klickbar') : bad('Pro: „Skript erstellen“ gesperrt');
  (await p.getByText(/Mehrere einzeln erstellen|einzeln erstellen/).count()) ? bad('Pro: Stapel-Knopf beim Skript sichtbar') : ok('Pro: kein Stapel-Knopf beim Skript');
  await p.screenshot({ path: `${OUT}/s03-pro-vor-erstellen.png` });
  await create.dblclick();
  const t0 = Date.now();
  let item = null;
  while (Date.now() - t0 < 12 * 60_000) {
    await p.waitForTimeout(10_000);
    const rows = (await admin.from('studio_items').select('id,title,kind,format_version,content').eq('user_id', pro.uid).order('created_at', { ascending: false })).data ?? [];
    item = rows.find(r => r.kind === 'script' && r.content?.blocks?.length);
    if (item) break;
    await p.screenshot({ path: `${OUT}/s04-fortschritt.png` });
  }
  if (!item) throw new Error('Kein Skript nach 12 Minuten gespeichert');
  console.log(`Gespeichert in ${Math.round((Date.now() - t0) / 1000)} s: "${item.title}", format ${item.content.format}`);
  await p.waitForTimeout(4000);
  const all = (await admin.from('studio_items').select('id').eq('user_id', pro.uid).eq('kind', 'script')).data ?? [];
  all.length === 1 ? ok('Doppelklick: genau ein Skript gespeichert') : bad(`Doppelklick: ${all.length} Skripte`);
  item.content.format === 'skript' ? ok('Gespeichert als format „skript“, kind „script“') : bad(`Format: ${item.content.format}`);

  // ── Aufbau im Ergebnis ──
  const blocks = item.content.blocks;
  const st = item.content.stats;
  const sections = blocks.filter(b => b.type === 'heading' && b.level === 3).length;
  const count = v => blocks.filter(b => b.type === 'callout' && b.variant === v).length;
  console.log(`Abschnitte ${sections}, Leitfragen ${count('leitfrage')}, Überleitungen ${count('bruecke')}, Fragen ${blocks.filter(b => b.type === 'check').length}, Studien ${blocks.filter(b => b.type === 'study').length}, Erklärhilfen ${blocks.filter(b => b.origin === 'ki').length}`);
  console.log(`Haupttext ${st.mainWords ?? st.outputWords} von ${st.sourceWords} Quellwörtern (${Math.round(((st.mainWords ?? st.outputWords) / st.sourceWords) * 100)} %), Prüfhinweise ${item.content.warnings.length}`);
  for (const w of item.content.warnings) console.log('  Hinweis:', w.slice(0, 200));

  // ── Anzeige ──
  await p.screenshot({ path: `${OUT}/s05-skript-desktop.png` });
  for (const [label, file] of [['Leitfrage', 's06-leitfrage'], ['Überleitung', 's07-ueberleitung'], ['Beispiel', 's08-beispiel'], ['Klausurfalle', 's09-klausurfalle']]) {
    const box = p.locator('div.rounded-xl', { has: p.locator('p', { hasText: new RegExp(`^${label}`, 'i') }) }).first();
    if (await box.count()) {
      await box.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
      const border = await box.evaluate(el => getComputedStyle(el).borderLeftWidth);
      parseFloat(border) >= 2 ? ok(`${label}: als Kasten (Rand ${border})`) : bad(`${label}: kein Kasten (${border})`);
      await box.screenshot({ path: `${OUT}/${file}.png` });
    } else bad(`${label}: nicht sichtbar`);
  }
  const checkLabels = await p.getByText('Kurz gecheckt', { exact: true }).count();
  checkLabels ? ok(`„Kurz gecheckt“ ${checkLabels}× sichtbar`) : bad('„Kurz gecheckt“ fehlt');
  const q = p.locator('button[aria-expanded]').filter({ visible: true }).first();
  if (await q.count()) {
    await q.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/s10-frage-zu.png` });
    await q.click(); await p.waitForTimeout(300);
    (await q.getAttribute('aria-expanded')) === 'true' ? ok('Frage klappt auf') : bad('Frage klappt nicht auf');
    const box = q.locator('xpath=..');
    await box.screenshot({ path: `${OUT}/s11-frage-offen.png` });
  } else bad('Keine aufklappbare Frage gefunden');
  const help = await p.getByText('Erklärhilfe', { exact: true }).count();
  help ? ok(`Erklärhilfe-Marke ${help}× sichtbar`) : bad('Keine Erklärhilfe-Marke');
  const body = await p.locator('main').innerText().catch(() => p.locator('body').innerText());
  /\bKI\b/.test(body) ? bad('Text „KI“ steht in der Oberfläche') : ok('Kein „KI“-Etikett in der Oberfläche');
  /[–—]/.test(body.replace(/\d\s*[–—]\s*\d/g, '')) ? console.log('– Gedankenstrich im Skript-Text (Modelltext, nicht UI):', body.match(/.{30}[–—].{30}/)?.[0]) : ok('Keine Gedankenstriche');

  // ── Handybreite ──
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/s12-handy.png` });
  const vw = await p.evaluate(() => innerWidth);
  const docW = await p.evaluate(() => document.documentElement.scrollWidth);
  docW <= vw + 1 ? ok('Handy: kein horizontales Überlaufen') : bad(`Handy: Seite ist ${docW} px breit`);
  const lf = p.locator('div.rounded-xl', { has: p.locator('p', { hasText: /^Leitfrage/i }) }).filter({ visible: true }).first();
  if (await lf.count()) { await lf.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/s13-handy-leitfrage.png` }); }
  const qq = p.locator('button[aria-expanded]').filter({ visible: true }).nth(1);
  if (await qq.count()) { await qq.scrollIntoViewIfNeeded(); await qq.click(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/s14-handy-frage.png` }); }
  await p.setViewportSize({ width: 1400, height: 950 }); await p.waitForTimeout(1200);

  // ── Fußnote öffnet die richtige Folie ──
  const chip = p.locator('span.align-super button').filter({ hasText: /F\. \d+|S\. \d+|\d+/ }).first();
  if (await chip.count()) {
    const title = (await chip.getAttribute('title')) ?? '';
    await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(800);
    const pick = p.getByRole('button', { name: /^Folie \d+ \(S\. \d+\)$|^Seite \d+$/ }).first();
    if (await pick.count()) { await pick.click(); await p.waitForTimeout(4000); }
    await p.screenshot({ path: `${OUT}/s15-reader-nach-fussnote.png` });
    const want = Number(title.match(/(?:gesamt )?S\. (\d+)/)?.[1]);
    const shown = Number(await p.locator('input[type=number]').first().inputValue().catch(() => ''));
    shown && shown === want ? ok(`Fußnote öffnet Seite ${want}`) : bad(`Fußnote: erwartet Seite ${want || '?'}, angezeigt ${shown || 'unbekannt'} (Tooltip "${title}")`);
  } else bad('Keine Fußnote gefunden');

  // ── Neu laden: Skript bleibt in der Liste ──
  await p.reload(); await p.waitForTimeout(5000);
  await p.getByRole('button', { name: /^Bibliothek/ }).first().click().catch(() => {}); await p.waitForTimeout(1500);
  await p.getByText('Allgemeine Psychologie 1', { exact: true }).filter({ visible: true }).first().click().catch(() => {}); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Lernstudio öffnen' }).filter({ visible: true }).first().click().catch(() => {}); await p.waitForTimeout(2500);
  (await p.getByText(item.title, { exact: false }).count()) ? ok('Nach Neuladen: Skript in der Liste') : bad('Nach Neuladen: Skript fehlt in der Liste');
  await p.screenshot({ path: `${OUT}/s16-nach-neuladen.png` });

  errors.length ? bad(`JS-Fehler: ${errors.slice(0, 3).join(' | ')}`) : ok('keine JS-Fehler');
} catch (e) {
  bad('Abbruch: ' + e.message);
} finally {
  await browser.close();
  await cleanup();
}
