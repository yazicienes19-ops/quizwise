// Lädt API-Schlüssel nur aus Umgebungsdateien: benchmark/.env, dann GEMINI_API_KEY aus backend/.env.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const load = (file: string, only?: string[]) => {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || (only && !only.includes(m[1])) || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
};

const root = join(import.meta.dirname, '..');
load(join(root, 'benchmark/.env'));
load(join(root, 'backend/.env'), ['GEMINI_API_KEY']);
