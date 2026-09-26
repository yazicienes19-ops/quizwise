// E2E Wissensnetz: Bedienung per Finger (CDP-Touch) und per Maus.
// Legt ein Wegwerf-Konto per Service-Key an und löscht es am Ende wieder.
// Aufruf (Dev-Server auf :3000):
//   set -a; . backend/.env; set +a; OUT=/tmp node scripts/e2e-graph-touch-mouse.mjs
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const OUT = process.env.OUT;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const email = `e2e-graph-${Date.now()}@studearc.test`; const password = 'E2e-Graph-' + crypto.randomBytes(6).toString('hex');
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (cErr) { console.log('createUser FEHLER', cErr.message); process.exit(1); }
const uid = created.user.id;
// Greifpunkt auf dem Verbindungsring eines Konzepts (rechts oder oben), als kleine Box.
const ringGrip = async (page, name, side = 'right') => {
  const r = await page.locator('[data-graph-node-id]', { hasText: name }).first().locator('[data-graph-connect-ring]').boundingBox();
  if (!r) return null;
  const [x, y] = side === 'top' ? [r.x + r.width / 2, r.y] : [r.x + r.width, r.y + r.height / 2];
  return { x: x - 2, y: y - 2, width: 4, height: 4 };
};
const ok = m => console.log('✓', m); const bad = m => console.log('✗', m);
const browser = await chromium.launch();
const init = () => { try { localStorage.setItem('studearc_onboarding_done', 'true'); localStorage.setItem('cookie_consent', 'accepted'); } catch {} };
try {
  // Anmelden am Desktop, Sitzung übernehmen
  const c0 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' }); await c0.addInitScript(init);
  const p0 = await c0.newPage(); await p0.goto('http://localhost:3000/'); await p0.waitForTimeout(2500);
  await p0.getByRole('button', { name: 'Anmelden' }).first().click(); await p0.waitForTimeout(600);
  await p0.getByPlaceholder(/mail/i).first().fill(email); await p0.locator('input[type=password]').first().fill(password);
  await p0.getByRole('button', { name: /^Einloggen$/ }).last().click(); await p0.waitForTimeout(7000);
  const storage = await c0.storageState(); await c0.close();

  // ── TOUCH ──
  const ct = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE', storageState: storage });
  await ct.addInitScript(init);
  const p = await ct.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(5000);
  await p.getByRole('button', { name: /Mehr/ }).last().tap(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /^Wissensnetz/ }).last().tap(); await p.waitForTimeout(3000);
  const cdp = await ct.newCDPSession(p);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tap = async (x, y) => { await touch('touchStart', x, y); await touch('touchEnd', x, y); };
  const dtap = async (x, y) => { await tap(x, y); await p.waitForTimeout(120); await tap(x + 3, y + 2); await p.waitForTimeout(700); };
  const drag = async (x1, y1, x2, y2) => { await touch('touchStart', x1, y1); for (let i = 1; i <= 12; i++) { await touch('touchMove', x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12); await p.waitForTimeout(16); } await touch('touchEnd', x2, y2); await p.waitForTimeout(700); };
  const svg = await p.locator('svg.w-full.h-full').first().boundingBox();
  const cx = svg.x + svg.width / 2, cy = svg.y + svg.height / 2;
  const typeTitle = async (name) => { const inp = p.locator('input:focus'); if (!(await inp.count())) return false; await inp.fill(name); await inp.press('Enter'); await p.waitForTimeout(600); return true; };
  const nodeBox = name => p.locator('[data-graph-node-id]', { hasText: name }).first().boundingBox();

  await p.getByRole('button', { name: 'Erstes Konzept anlegen' }).tap(); await p.waitForTimeout(900);
  (await typeTitle('Alpha')) ? ok('Touch: erstes Konzept über die Einstiegskarte') : bad('Touch: Einstiegskarte');
  const aPos = await nodeBox('Alpha');
  const sv = await p.locator('svg.w-full.h-full').first().boundingBox();
  const freeX = sv.x + 70, freeY = sv.y + 190;
  await dtap(freeX, freeY);
  (await typeTitle('Beta')) ? ok('Touch: Doppeltippen auf freie Fläche legt Konzept an') : bad('Touch: Doppeltippen legt kein Konzept an');
  const a = await nodeBox('Alpha'), b = await nodeBox('Beta');
  if (!a || !b) throw new Error('Konzepte nicht gefunden');
  await tap(a.x + a.width / 2, a.y + a.height / 2); await p.waitForTimeout(700);
  const handle = await ringGrip(p, 'Alpha');
  if (!handle) bad('Touch: Greifring nicht gefunden'); else {
    ok('Touch: Greifring am Rand vorhanden');
    const bNow = await nodeBox('Beta');
    const x1 = handle.x + handle.width / 2, y1 = handle.y + handle.height / 2, x2 = bNow.x + bNow.width / 2, y2 = bNow.y + bNow.height / 2;
    await touch('touchStart', x1, y1); for (let i = 1; i <= 12; i++) { await touch('touchMove', x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12); await p.waitForTimeout(16); }
    await touch('touchEnd', x2, y2); await p.waitForTimeout(700);
    const rel = p.locator('input:focus');
    if (await rel.count()) { await rel.fill('führt zu'); await rel.press('Enter'); await p.waitForTimeout(900);
      (await p.getByText('führt zu').count()) ? ok('Touch: Beziehung gezogen und benannt') : bad('Touch: Beziehung nicht sichtbar');
    } else bad('Touch: Beziehungs-Eingabe erscheint nicht');
  }
  const b2 = await nodeBox('Beta');
  await dtap(b2.x + b2.width / 2, b2.y + b2.height / 2);
  (await typeTitle('Gamma')) && (await p.getByText('Gamma').count()) ? ok('Touch: Doppeltippen benennt um') : bad('Touch: Umbenennen per Doppeltippen');
  const a1 = await nodeBox('Alpha');
  await drag(a1.x + a1.width / 2, a1.y + a1.height / 2, a1.x + a1.width / 2 + 70, a1.y + a1.height / 2 + 60);
  const a2 = await nodeBox('Alpha');
  Math.abs(a2.x - a1.x) > 30 ? ok('Touch: Konzept verschieben') : bad('Touch: Konzept lässt sich nicht verschieben');
  await p.getByRole('button', { name: 'Konzept hinzufügen' }).tap(); await p.waitForTimeout(800);
  (await typeTitle('Delta')) ? ok('Touch: Knopf „+ Konzept“') : bad('Touch: Knopf „+ Konzept“');
  // Beziehung antippen und löschen
  const [mx, my] = await p.evaluate(() => {
    const path = document.querySelector('[data-graph-edge-hit]');
    const len = path.getTotalLength(); const pt = path.getPointAtLength(len / 2);
    const m = path.getScreenCTM(); return [pt.x * m.a + pt.y * m.c + m.e, pt.x * m.b + pt.y * m.d + m.f];
  });
  await tap(mx, my); await p.waitForTimeout(700);
  const del = p.getByRole('button', { name: 'Beziehung löschen' });
  if (await del.count()) { const bb = await del.boundingBox(); await del.tap(); await p.waitForTimeout(900);
    (await p.getByText('führt zu').count()) === 0 ? ok(`Touch: Beziehung antippen und löschen (Knopf ${Math.round(bb.width)} px)`) : bad('Touch: Beziehung nicht gelöscht');
  } else bad('Touch: Beziehung lässt sich nicht antippen');
  // Zwei-Finger-Zoom
  const scale = () => p.evaluate(() => { const t = document.querySelector('svg.w-full.h-full > g')?.getAttribute('transform') || ''; const k = /scale\(([\d.]+)/.exec(t); return k ? Number(k[1]) : 1; });
  const sv2 = await p.locator('svg.w-full.h-full').first().boundingBox();
  const zx = sv2.x + sv2.width / 2, zy = sv2.y + 140;
  const t0 = await scale();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zx - 20, y: zy, id: 1 }, { x: zx + 20, y: zy, id: 2 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zx - 20 - i * 8, y: zy, id: 1 }, { x: zx + 20 + i * 8, y: zy, id: 2 }] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(600);
  const t1 = await scale();
  t1 > t0 * 1.2 ? ok(`Touch: Zwei-Finger-Zoom (${t0.toFixed(2)} → ${t1.toFixed(2)})`) : bad(`Touch: Zwei-Finger-Zoom (${t0} → ${t1})`);
  const nodesAfterPinch = await p.locator('[data-graph-node-id]').count();
  // Detailleiste aufklappen
  await p.getByRole('button', { name: 'Ansicht einpassen' }).tap(); await p.waitForTimeout(700);
  const d0 = await nodeBox('Alpha'); await tap(d0.x + d0.width / 2, d0.y + d0.height / 2); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Details' }).tap({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500);
  (await p.getByText('Eigene Notizen', { exact: false }).count()) ? ok('Touch: Detailleiste aufklappen') : bad('Touch: Detailleiste');
  await p.screenshot({ path: `${OUT}/graph-touch.png` });
  console.log('Touch JS-Fehler:', errors.slice(0, 3));
  await ct.close();

  // ── MAUS ──
  const cm = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE', storageState: storage });
  await cm.addInitScript(init);
  const m = await cm.newPage(); m.on('console', msg => { if (msg.text().includes('[e2e]')) console.log('   ', msg.text()); }); const errs2 = []; m.on('pageerror', e => errs2.push(e.message));
  await m.goto('http://localhost:3000/'); await m.waitForTimeout(5000);
  await m.getByRole('button', { name: /^Wissensnetz/ }).first().click(); await m.waitForTimeout(3000);
  const s2 = await m.locator('svg.w-full.h-full').first().boundingBox();
  await m.mouse.dblclick(s2.x + 120, s2.y + s2.height - 120); await m.waitForTimeout(700);
  const mi = m.locator('input:focus'); if (await mi.count()) { await mi.fill('Epsilon'); await mi.press('Enter'); await m.waitForTimeout(600); ok('Maus: Doppelklick legt Konzept an'); } else bad('Maus: Doppelklick');
  const e1 = await m.locator('[data-graph-node-id]', { hasText: 'Epsilon' }).first().boundingBox();
  const d1 = await m.locator('[data-graph-node-id]', { hasText: 'Delta' }).first().boundingBox();
  await m.mouse.click(e1.x + e1.width / 2, e1.y + e1.height / 2); await m.waitForTimeout(500);
  // Vom oberen Rand losziehen und NEBEN dem Ziel loslassen: der Magnet muss einrasten.
  const h2 = await ringGrip(m, 'Epsilon', 'top');
  await m.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2); await m.mouse.down();
  await m.mouse.move(d1.x + d1.width + 12, d1.y + d1.height / 2, { steps: 12 }); await m.mouse.up(); await m.waitForTimeout(700);
  const r2 = m.locator('input:focus');
  if (await r2.count()) { await r2.fill('gehört zu'); await r2.press('Enter'); await m.waitForTimeout(800); (await m.getByText('gehört zu').count()) ? ok('Maus: Beziehung ziehen') : bad('Maus: Beziehung fehlt'); } else bad('Maus: Beziehungs-Eingabe fehlt');
  const [emx, emy] = await m.evaluate(() => {
    const paths = [...document.querySelectorAll('[data-graph-edge-hit]')]; const path = paths[paths.length - 1];
    const len = path.getTotalLength(); const pt = path.getPointAtLength(len / 2);
    const mm = path.getScreenCTM(); return [pt.x * mm.a + pt.y * mm.c + mm.e, pt.x * mm.b + pt.y * mm.d + mm.f];
  });
  await m.mouse.click(emx, emy); await m.waitForTimeout(600);
  (await m.getByRole('button', { name: 'Beziehung löschen' }).count()) ? ok('Maus: Beziehung anklicken') : bad('Maus: Beziehung anklicken');
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  const e2 = await m.locator('[data-graph-node-id]', { hasText: 'Epsilon' }).first().boundingBox();
  await m.mouse.dblclick(e2.x + e2.width / 2, e2.y + e2.height / 2); await m.waitForTimeout(600);
  const r3 = m.locator('input:focus'); (await r3.count()) ? (await r3.fill('Zeta'), await r3.press('Enter'), ok('Maus: Doppelklick benennt um')) : bad('Maus: Umbenennen');
  const scaleOf = () => m.evaluate(() => { const g = document.querySelector('svg.w-full.h-full > g'); const t = g?.getAttribute('transform') || ''; const k = /scale\(([\d.]+)/.exec(t); return k ? Number(k[1]) : 1; });
  const k0 = await scaleOf();
  await m.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2);
  await m.keyboard.down('Control'); await m.mouse.wheel(0, -200); await m.keyboard.up('Control'); await m.waitForTimeout(600);
  const k1 = await scaleOf();
  k1 > k0 ? ok(`Maus: Trackpad-Pinch zoomt (${k0.toFixed(2)} → ${k1.toFixed(2)})`) : bad(`Maus: Trackpad-Pinch zoomt nicht (${k0} → ${k1})`);
  await m.screenshot({ path: `${OUT}/graph-mouse.png` });
  console.log('Maus JS-Fehler:', errs2.slice(0, 3));
} catch (e) { console.log('FEHLER', e.message.split('\n')[0]); }
finally {
  await browser.close();
  const { error } = await admin.auth.admin.deleteUser(uid); console.log(error ? 'Löschen FEHLER ' + error.message : 'Testkonto gelöscht');
}
