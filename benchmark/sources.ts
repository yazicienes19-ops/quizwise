import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceRef } from './features.ts';

export const SOURCES_DIR = join(import.meta.dirname, 'datasets/sources');

/** Quelltext eines Testfalls; mehrere Dateien werden mit Trenner hintereinandergehängt. */
export const resolveSource = (ref?: SourceRef): string => {
  if (!ref) return '';
  if (ref.inline !== undefined) return ref.inline;
  return ref.files.map(f => {
    const text = readFileSync(join(SOURCES_DIR, f), 'utf8');
    if (!ref.from) return text;
    const lines = text.split('\n');
    const a = lines.findIndex(l => l.trim().startsWith(ref.from!));
    if (a < 0) throw new Error(`Abschnitt "${ref.from}" nicht in ${f}`);
    const b = ref.to ? lines.findIndex((l, i) => i > a && l.trim().startsWith(ref.to!)) : -1;
    return lines.slice(a, b < 0 ? undefined : b).join('\n');
  }).join('\n\n');
};
