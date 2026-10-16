import type { PipelineSource } from './types';
import { countWords } from './text';

/**
 * Doppelte Seiten über Quellen hinweg (Sammeldatei + Einzel-PDFs mit denselben
 * Folien, auch PDFs aus "Zusammenfügen"). Je Duplikat bleibt die Seite der
 * spezifischeren Quelle, also der mit weniger Seiten. Die übrigen werden vor
 * der Extraktion ausgeblendet: das spart Kosten, und Fußnoten zeigen auf das
 * Einzel-PDF statt auf die Sammeldatei.
 */

export const SHINGLE = 5;
export const DUP_THRESHOLD = 0.8;

export const normalizePageText = (t: string): string =>
  t.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();

const shingles = (norm: string): Set<string> => {
  const words = norm.split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < SHINGLE) { if (words.length) out.add(words.join(' ')); return out; }
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(' '));
  return out;
};

export const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) if (big.has(s)) inter += 1;
  return inter / (a.size + b.size - inter);
};

export interface DedupeResult {
  /** Quelle → Seiten (1-basiert), die als Duplikat wegfallen. */
  dropped: Map<string, Set<number>>;
  /** "docId:page" der weggefallenen Seite → behaltene Seite. */
  keptFor: Map<string, { sourceId: string; page: number }>;
}

/** Seiten mit sehr wenig Text (Titelfolien) zählen nur bei exakt gleichem Text als Duplikat. */
const MIN_WORDS_FOR_FUZZY = 8;

export const findDuplicatePages = (sources: PipelineSource[]): DedupeResult => {
  const dropped = new Map<string, Set<number>>();
  const keptFor = new Map<string, { sourceId: string; page: number }>();
  // Spezifischste Quelle zuerst: ihre Seiten werden behalten, spätere gegen sie geprüft.
  const order = [...sources].filter(s => s.pages).sort((a, b) => a.pageCount - b.pageCount);
  const kept: { sourceId: string; page: number; norm: string; sh: Set<string>; words: number }[] = [];

  for (const src of order) {
    src.pages!.forEach((text, i) => {
      const norm = normalizePageText(text);
      if (!norm) return;
      const words = countWords(norm);
      const sh = shingles(norm);
      let match: (typeof kept)[number] | undefined;
      for (const k of kept) {
        if (k.sourceId === src.docId) continue;
        if (words < MIN_WORDS_FOR_FUZZY || k.words < MIN_WORDS_FOR_FUZZY) {
          if (k.norm === norm) { match = k; break; }
          continue;
        }
        if (Math.abs(k.words - words) > Math.max(k.words, words) * 0.5) continue;
        if (jaccard(k.sh, sh) >= DUP_THRESHOLD) { match = k; break; }
      }
      if (match) {
        if (!dropped.has(src.docId)) dropped.set(src.docId, new Set());
        dropped.get(src.docId)!.add(i + 1);
        keptFor.set(`${src.docId}:${i + 1}`, { sourceId: match.sourceId, page: match.page });
        return;
      }
      const entry = { sourceId: src.docId, page: i + 1, norm, sh, words };
      kept.push(entry);
    });
  }
  return { dropped, keptFor };
};

/** Quelle mit ausgeblendeten Duplikat-Seiten (Seitennummern bleiben gleich). */
export const withoutDuplicates = (src: PipelineSource, dup: DedupeResult): PipelineSource => {
  const drop = dup.dropped.get(src.docId);
  if (!drop?.size || !src.pages) return src;
  return { ...src, pages: src.pages.map((p, i) => (drop.has(i + 1) ? '' : p)) };
};

/** Wörter der Quellen nach dem Entfernen der Duplikate (Grundlage für das Längenbudget). */
export const sourceWordCount = (sources: PipelineSource[]): number =>
  sources.reduce((sum, s) => sum + (s.pages ? s.pages.reduce((a, p) => a + countWords(p), 0) : countWords(s.plain ?? '')), 0);
