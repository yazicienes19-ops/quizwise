// Baut ein Inhaltsverzeichnis aus dem PDF selbst, wenn dessen eingebettete
// Gliederung (pdf.doc.getOutline()) nicht nutzbar ist — bei aus PowerPoint
// exportierten Vorlesungsfolien enthält sie oft nur "Folie 1", "Folie 2", ...
// statt echter Themen (live an einem echten 296-seitigen Foliensatz geprüft).
//
// Stattdessen: echte Kapitelüberschriften stehen in deutlich größerer
// Schrift als der Fließtext, UND die Folie enthält insgesamt wenig Text
// (Titel-/Trennfolien vs. inhaltsreiche Folien). Viele folgen zusätzlich
// einer nummerierten Gliederung ("2.1 Klassische Konditionierung"), die sich
// direkt in eine Baumtiefe übersetzen lässt.
import type { PdfHandle, PositionedTextItem } from './pdfPageService';
import { getPageTextItems } from './pdfPageService';

export interface PdfTocEntry {
  title: string;
  page: number;
  children: PdfTocEntry[];
}

export interface HeadingCandidate {
  page: number;
  title: string;
}

/** Nur Textfragmente mit sichtbarem Inhalt zählen für Höhen-/Längenschätzung. */
const median = (nums: number[]): number => {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Erkennt eine numerische Gliederung ("2", "2.1", "2.1.1") am Anfang einer
 * erkannten Überschrift und liefert den Zahlenpfad + bereinigten Titel. Kein
 * Treffer = keine erkennbare Nummerierung (wird als flacher Top-Level-Eintrag
 * behandelt, kein Fehler).
 */
export function parseHeadingPrefix(text: string): { path: number[]; title: string } | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
  if (!m) return null;
  const title = m[2].trim();
  if (!title) return null;
  return { path: m[1].split('.').map(Number), title };
}

/** true, wenn `prefix` ein echtes Präfix von `full` ist (z.B. [2] von [2,1],
 *  aber NICHT [1] von [2,1] — unterschiedliche Kapitelnummer trotz "kleinerer" Tiefe). */
function isPrefixOf(prefix: number[], full: number[]): boolean {
  if (prefix.length >= full.length) return false;
  return prefix.every((n, i) => n === full[i]);
}

/**
 * Baut aus einer flachen, seitensortierten Kandidatenliste einen verschachtelten
 * Baum: "2" wird Elternknoten von "2.1", "2.1" Elternknoten von "2.1.1". Auch
 * wenn "2" selbst nie als eigene Überschrift auftaucht, landet "2.1" korrekt
 * als neuer Top-Level-Zweig statt fälschlich unter Kapitel "1" (reine
 * Tiefen-Vergleiche ohne Zahlenpfad würden das falsch verschachteln). Einträge
 * ohne erkennbare Nummerierung werden als flache Top-Level-Einträge angehängt.
 */
export function buildTocTree(candidates: HeadingCandidate[]): PdfTocEntry[] {
  const root: PdfTocEntry[] = [];
  const stack: { path: number[]; node: PdfTocEntry }[] = [];

  for (const c of candidates) {
    const parsed = parseHeadingPrefix(c.title);
    if (!parsed) {
      root.push({ title: c.title, page: c.page, children: [] });
      stack.length = 0;
      continue;
    }
    const node: PdfTocEntry = { title: parsed.title, page: c.page, children: [] };
    while (stack.length && !isPrefixOf(stack[stack.length - 1].path, parsed.path)) stack.pop();
    (stack.length === 0 ? root : stack[stack.length - 1].node.children).push(node);
    stack.push({ path: parsed.path, node });
  }
  return root;
}

/**
 * Erkennt pro Seite die vermutliche "Titel-Zeile": deutlich größere Schrift als
 * der Median der Seite UND insgesamt wenig Text auf der Seite. Konsekutive
 * Seiten mit demselben erkannten Titel (ein Thema läuft über mehrere Folien)
 * werden zu einem einzigen Eintrag zusammengefasst.
 */
export function detectHeadingCandidates(
  pages: { page: number; items: PositionedTextItem[] }[]
): HeadingCandidate[] {
  const raw: HeadingCandidate[] = [];
  for (const { page, items } of pages) {
    const withText = items.filter(it => it.str.trim());
    if (withText.length === 0) continue;
    const heights = withText.map(it => it.h);
    const maxH = Math.max(...heights);
    const medianH = median(heights);
    const totalChars = withText.reduce((s, it) => s + it.str.length, 0);
    if (totalChars < 500 && medianH > 0 && maxH > medianH * 1.6) {
      const title = withText.filter(it => it.h >= maxH - 0.5).map(it => it.str.trim()).join(' ').trim();
      if (title) raw.push({ page, title });
    }
  }
  const deduped: HeadingCandidate[] = [];
  for (const c of raw) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.title === c.title) continue;
    deduped.push(c);
  }
  return deduped;
}

/** Ruft Textfragmente für mehrere Seiten mit begrenzter Nebenläufigkeit ab —
 *  alle 296 Seiten sequentiell abzufragen wäre unnötig langsam, alle gleichzeitig
 *  könnte den pdf.js-Worker überlasten. */
async function mapPagesLimited<T>(
  numPages: number,
  concurrency: number,
  fn: (page: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(numPages);
  let next = 1;
  const worker = async () => {
    while (next <= numPages) {
      const p = next++;
      results[p - 1] = await fn(p);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, numPages) }, worker));
  return results;
}

/**
 * Baut das Inhaltsverzeichnis direkt aus dem gerenderten PDF (siehe Kommentar
 * oben — die eingebettete Gliederung ist bei Foliensätzen oft unbrauchbar).
 * Läuft einmalig im Hintergrund, sobald das PDF geladen ist.
 */
export async function buildPdfOutline(pdf: PdfHandle, concurrency = 10): Promise<PdfTocEntry[]> {
  const perPage = await mapPagesLimited(pdf.numPages, concurrency, async page => {
    const { items } = await getPageTextItems(pdf, page);
    return { page, items };
  });
  return buildTocTree(detectHeadingCandidates(perPage));
}
