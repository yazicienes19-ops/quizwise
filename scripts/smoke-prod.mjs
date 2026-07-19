// Deploy-Smoke-Test: nach JEDEM Produktions-Deploy laufen lassen.
//   node scripts/smoke-prod.mjs
// Braucht Playwright (einmalig: npm i -D playwright && npx playwright install chromium).
// Prüft die drei Szenarien, die reale Ausfälle verursacht haben:
//   1. Landing lädt ohne JS-Fehler (Weißseiten-Klasse)
//   2. Login mountet die App (Konto-Daten-Klasse)
//   3. App startet auch mit VOLLEM localStorage (QuotaExceeded-Klasse, 19.07.2026)

const URL = process.env.SMOKE_URL || 'https://quizwise-kappa.vercel.app/';
const USER = process.env.SMOKE_USER || 'demo@quizwise.app';
const PASS = process.env.SMOKE_PASS || 'QuizWise2026!';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Playwright fehlt: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const fail = (msg) => { console.error('❌ SMOKE FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('✅', msg);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// 1. Landing
await page.goto(URL);
await page.waitForTimeout(4000);
let root = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
root > 1000 ? ok(`Landing gerendert (#root=${root})`) : fail(`Landing leer (#root=${root})`);

// 2. Login
await page.getByRole('button', { name: 'Anmelden' }).first().click().catch(() => fail('Anmelden-Button fehlt'));
await page.waitForTimeout(800);
await page.getByPlaceholder(/mail/i).first().fill(USER);
await page.locator('input[type=password]').first().fill(PASS);
await page.getByRole('button', { name: /^Einloggen$/ }).last().click();
await page.waitForTimeout(9000);
const skip = page.getByText('Überspringen').first();
if (await skip.count()) await skip.click().catch(() => {});
root = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
root > 5000 ? ok(`App nach Login gemountet (#root=${root})`) : fail(`App nach Login leer (#root=${root})`);

// 3. Voller Speicher
await page.evaluate(() => {
  const chunk = 'x'.repeat(500 * 1024);
  for (let i = 0; i < 40; i++) localStorage.setItem('smokefill_' + i, chunk);
});
await page.reload();
await page.waitForTimeout(6000);
root = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
root > 1000 ? ok(`App startet trotz vollem Speicher (#root=${root})`) : fail(`Voller Speicher killt App (#root=${root})`);

if (errors.length) fail(`JS-Fehler auf der Seite: ${errors.slice(0, 3).join(' | ')}`);
else ok('Keine JS-Fehler');
await browser.close();
process.exit(process.exitCode ?? 0);
