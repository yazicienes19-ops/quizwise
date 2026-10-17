// E2E Lernstudio-Ansicht (Phase 3): ein fertiges v2-Ergebnis anzeigen, ohne es neu zu erzeugen.
// Legt ein Wegwerf-Konto (Pro) mit der PDF und einem gespeicherten Ergebnis an
// (RESULT = JSON aus npm run eval:studio, PARTS = Vorlesungen der PDF als JSON)
// und macht Screenshots in Dunkel und Hell, Desktop und Handy. Konto wird gelöscht.
// Aufruf: set -a; . backend/.env; set +a; APP=http://localhost:3001 PDF=… RESULT=… PARTS=… OUT=… node scripts/e2e-lernstudio-ansicht.mjs
// PDF und Ergebnis liegen nur lokal (benchmark/, gitignored).
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP ?? 'http://localhost:3001';
const { OUT, PDF, RESULT, PARTS } = process.env;
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const ok = m => console.log('✓', m); const bad = m => console.log('✗', m);

const email = `e2e-ansicht-${Date.now()}@studearc.test`;
const password = 'E2e-Ansicht-' + crypto.randomBytes(6).toString('hex');
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (cErr) { console.log('createUser FEHLER', cErr.message); process.exit(1); }
const uid = created.user.id;
const docId = crypto.randomUUID();
const storagePath = `${uid}/${docId}/gesamt.pdf`;
const cleanup = async () => {
  await admin.storage.from('document-files').remove([storagePath]).catch(() => {});
  const { error } = await admin.auth.admin.deleteUser(uid);
  console.log(error ? 'Löschen FEHLER ' + error.message : 'Testkonto gelöscht');
};

const browser = await chromium.launch();
try {
  await admin.from('profiles').update({ plan: 'pro', preferences: { onboarding_done: true } }).eq('id', uid);
  const colId = 'e2ecol' + crypto.randomBytes(3).toString('hex');
  await admin.from('collections').insert({ id: colId, user_id: uid, name: 'Allgemeine Psychologie 1', emoji: '🧠', color: '#6366f1', folders: [] });
  const up = await admin.storage.from('document-files').upload(storagePath, readFileSync(PDF), { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error('Upload: ' + up.error.message);
  const name = 'Allgemeine Psychologie 1 (gesamt)';
  const ins = await admin.from('documents').insert({ id: docId, user_id: uid, name, file_type: 'pdf', mime_type: 'application/pdf', collection_id: colId, storage_path: storagePath, upload_date: Date.now(), status: 'ready' });
  if (ins.error) throw new Error('Dokument: ' + ins.error.message);
  // Ergebnis aus dem Eval: Quell-ID auf das Testdokument umschreiben.
  const raw = JSON.parse(readFileSync(RESULT, 'utf8'));
  const content = JSON.parse(JSON.stringify(raw).replaceAll(`"${raw.blocks.flatMap(b => b.cites ?? [])[0]?.sourceId}"`, `"${docId}"`));
  delete content.diagnostics;
  const kind = content.format === 'skript' ? 'script' : 'summary';
  const item = await admin.from('studio_items').insert({
    id: crypto.randomUUID(), user_id: uid, collection_id: colId, kind, title: kind === 'script' ? 'Skript' : 'Zusammenfassung',
    markdown: '', sources: [{ n: 1, docId, name, parts: JSON.parse(readFileSync(PARTS, 'utf8')) }], focus: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), content, format_version: 2, idempotency_key: null,
  });
  if (item.error) throw new Error('Ergebnis: ' + item.error.message);

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'de-DE' });
    await ctx.addInitScript(th => { try { localStorage.setItem('studearc_onboarding_done', 'true'); localStorage.setItem('cookie_consent', 'accepted'); localStorage.setItem('theme', th); } catch {} }, theme);
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(APP); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: 'Anmelden' }).first().click(); await p.waitForTimeout(600);
    await p.getByPlaceholder(/mail/i).first().fill(email); await p.locator('input[type=password]').first().fill(password);
    await p.getByRole('button', { name: /^Einloggen$/ }).last().click(); await p.waitForTimeout(6000);
    await p.getByRole('button', { name: /^Bibliothek/ }).first().click(); await p.waitForTimeout(1500);
    await p.getByText('Allgemeine Psychologie 1', { exact: true }).filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Lernstudio öffnen' }).filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
    await p.getByText(kind === 'script' ? 'Skript' : 'Zusammenfassung', { exact: true }).filter({ visible: true }).last().click(); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${theme}-01-kopf.png` });

    // Fußnoten: hochgestellte Nummern, fortlaufend.
    const fns = p.locator('sup button');
    const labels = await fns.allTextContents();
    const seq = labels.every((l, i) => Number(l) === i + 1);
    labels.length && seq ? ok(`${theme}: ${labels.length} Fußnoten, fortlaufend 1 bis ${labels.length}`) : bad(`${theme}: Fußnoten ${labels.slice(0, 10).join(',')}`);
    const fn = fns.nth(2);
    const title = await fn.getAttribute('title');
    await fn.scrollIntoViewIfNeeded(); await fn.click(); await p.waitForTimeout(600);
    const bar = await p.getByText(/^Fußnote 3 ·/).count();
    bar ? ok(`${theme}: Fußnote 3 („${title}“) zeigt die Leiste mit allen Seiten`) : bad(`${theme}: Leiste nach Fußnote fehlt`);
    await p.screenshot({ path: `${OUT}/${theme}-02-fussnote.png` });

    // Inhaltsverzeichnis
    const toc = p.locator('nav[aria-label="Inhalt"]');
    if (await toc.count()) {
      const entries = await toc.locator('li').allTextContents();
      ok(`${theme}: Inhaltsverzeichnis mit ${entries.length} Einträgen`);
      await toc.scrollIntoViewIfNeeded(); await toc.screenshot({ path: `${OUT}/${theme}-03-inhalt.png` });
      // Ein Eintrag aus der Mitte (der letzte steht am Seitenende und kann nicht nach oben rücken).
      const k = Math.floor(entries.length / 2);
      await toc.locator('li button').nth(k).click(); await p.waitForTimeout(1200);
      const last = entries[k].replace(/^\d+/, '');
      const box = await p.getByRole('heading', { name: last, exact: true }).first().boundingBox();
      box && box.y >= 0 && box.y < 950 - 120 ? ok(`${theme}: Sprung zu „${last}“`) : bad(`${theme}: Sprung zu „${last}“ (y=${box?.y})`);
      await p.screenshot({ path: `${OUT}/${theme}-04-nach-sprung.png` });
    } else bad(`${theme}: kein Inhaltsverzeichnis`);

    // Kästen und Studienkarte
    for (const [label, file] of [['Leitfrage', '05-leitfrage'], ['Klausurfalle', '06-klausurfalle'], ['Hinweis', '07-hinweis'], ['Beispiel', '08-beispiel'], ['Überleitung', '09-ueberleitung'], ['Merksatz', '09b-merksatz']]) {
      const box = p.locator('div.rounded-xl', { has: p.locator('p', { hasText: new RegExp(`^${label}`, 'i') }) }).first();
      if (await box.count()) { await box.scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await box.screenshot({ path: `${OUT}/${theme}-${file}.png` }); }
    }
    const study = p.locator('dl').first();
    if (await study.count()) { const card = study.locator('xpath=..'); await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${OUT}/${theme}-10-studie.png` }); ok(`${theme}: Studienkarte`); }

    // Handy
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
    const vw = await p.evaluate(() => innerWidth);
    const docW = await p.evaluate(() => document.documentElement.scrollWidth);
    docW <= vw + 1 ? ok(`${theme}: Handy ohne Überlaufen`) : bad(`${theme}: Handy ${docW} px breit`);
    if (await study.count()) { await study.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${theme}-11-handy-studie.png` }); }
    const f2 = p.locator('sup button').filter({ visible: true }).first();
    await f2.scrollIntoViewIfNeeded(); await f2.click(); await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/${theme}-12-handy-fussnote.png` });
    // Tippfläche inklusive unsichtbarer Vergrößerung (::after).
    const tap = await f2.evaluate(el => { const r = el.getBoundingClientRect(); const a = getComputedStyle(el, '::after'); return { w: r.width - 2 * parseFloat(a.left), h: r.height - 2 * parseFloat(a.top) }; });
    tap.h >= 40 ? ok(`${theme}: Tippfläche der Fußnote ${Math.round(tap.w)} x ${Math.round(tap.h)} px`) : bad(`${theme}: Tippfläche ${Math.round(tap.w)} x ${Math.round(tap.h)} px`);
    errors.length ? bad(`${theme}: JS-Fehler ${errors.slice(0, 2).join(' | ')}`) : ok(`${theme}: keine JS-Fehler`);
    await ctx.close();
  }
} catch (e) {
  bad('Abbruch: ' + e.message);
} finally {
  await browser.close();
  await cleanup();
}
