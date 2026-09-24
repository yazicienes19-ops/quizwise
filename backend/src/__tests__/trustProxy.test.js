import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// index.js startet beim Import den Server und die Scheduler, deshalb prüfen
// wir die Einstellung im Quelltext. Fehlt sie, zählt express-rate-limit alle
// Nutzer über die Railway-Edge-IP gemeinsam.
describe('trust proxy', () => {
  it('ist in index.js auf genau einen Proxy gesetzt', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(dir, '..', 'index.js'), 'utf8');
    expect(src).toMatch(/app\.set\(\s*'trust proxy'\s*,\s*1\s*\)/);
    expect(src.indexOf("app.set('trust proxy'")).toBeLessThan(src.indexOf('rateLimit({'));
  });
});
