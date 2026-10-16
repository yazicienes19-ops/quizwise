import { sha256 } from './llm';

/**
 * Schlüssel einer Generierung: Fach, Quellen samt Kapitelbereichen, Format und
 * Optionen. Reihenfolge der Auswahl spielt keine Rolle. Gleicher Schlüssel =
 * ein gespeicherter Eintrag (Neu-Erstellen ersetzt ihn).
 */
export const studioIdempotencyKey = (opts: {
  collectionId: string;
  format: string;
  sources: { docId: string; ranges?: [number, number][] }[];
  focus?: string;
  figures: boolean;
  argon: boolean;
}): Promise<string> => {
  const sources = [...opts.sources]
    .map(s => `${s.docId}${s.ranges?.length ? `@${[...s.ranges].sort((a, b) => a[0] - b[0]).map(r => r.join('-')).join(',')}` : ''}`)
    .sort();
  const canonical = JSON.stringify({
    c: opts.collectionId, f: opts.format, s: sources,
    q: (opts.focus ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
    fig: opts.figures, a: opts.argon, v: 2,
  });
  return sha256(canonical);
};
