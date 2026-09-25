import type { ProcessedDocument } from '../types';
import type { FullText } from './moduleDeck';
import { downloadPdfAsBase64 } from './documentService';
import { loadPdf, getPageText, isScannedPage } from './pdfPageService';

/**
 * Volltext eines PDFs aus der Textebene, Seite für Seite (für "Ganzes Fach als
 * Karten": Karten aus dem ganzen Dokument statt aus der Zusammenfassung).
 * Seiten werden mit Leerzeile getrennt, damit splitSections dort teilen kann.
 */

/** Unter diesem Anteil lesbarer Seiten gilt das PDF als Scan; dann bleibt es bei der Zusammenfassung. */
export const MIN_TEXT_PAGE_RATIO = 0.5;

export const canReadFullText = (doc: ProcessedDocument): boolean =>
  doc.type === 'pdf' && !!(doc.storagePath || doc.content);

/** Seitentexte zusammensetzen; null, wenn zu wenige Seiten eine Textebene haben. */
export const joinPages = (pages: string[]): FullText | null => {
  if (!pages.length) return null;
  const readable = pages.filter(p => !isScannedPage(p));
  if (readable.length / pages.length < MIN_TEXT_PAGE_RATIO) return null;
  return { text: readable.map(p => p.trim()).join('\n\n'), pages: readable.length };
};

const cache = new Map<string, FullText | null>();

export const readPdfFullText = async (
  doc: ProcessedDocument,
  onPage?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<FullText | null> => {
  if (cache.has(doc.id)) return cache.get(doc.id)!;
  const pdf = await loadPdf(doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content);
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (isCancelled?.()) return null;
      pages.push(await getPageText(pdf, n));
      onPage?.(n, pdf.numPages);
    }
    const text = joinPages(pages);
    cache.set(doc.id, text);
    return text;
  } finally {
    void pdf.doc.cleanup();
  }
};
