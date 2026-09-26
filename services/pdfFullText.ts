import type { ProcessedDocument } from '../types';
import type { FullText } from './moduleDeck';
import { downloadPdfAsBase64 } from './documentService';
import { loadPdf, getPageText, isScannedPage, renderPageToJpegBase64 } from './pdfPageService';
import { transcribePdfPages } from './geminiService';

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

/**
 * Mathe-PDFs erkennen: Die Textebene zerlegt dort Brüche, Summen und Spalten
 * ("2/3" wird "2 3", Formeln mit Mathe-Sonderzeichen werden unlesbar). Gemessen
 * am 26.09.2026 an echten Unterlagen: Fließtext und Psychologie-Folien liegen
 * bei höchstens 0,026 Mathe-Zeichen je Buchstabe und 0,046 Zahlen-Wörtern;
 * Statistik-Übungen und Mathe-Bücher ab 0,05 bzw. 0,067. Ein Paper mit vielen
 * Statistikwerten im Fließtext (0,056 / 0,027) bleibt bewusst außen vor.
 */
export const MATH_CHAR_RATIO = 0.045;
export const NUMBER_TOKEN_RATIO = 0.06;
/** Mathematische Alphanumerik (𝒔, 𝑿, 𝟏 …): so exportieren Folien Formeln. */
const MATH_ALNUM = /[\u{1D400}-\u{1D7FF}]/gu;

export const looksMathHeavy = (pages: string[]): boolean => {
  const all = pages.join(' ');
  const letters = (all.match(/\p{L}/gu) || []).length;
  if (letters === 0) return false;
  if ((all.match(MATH_ALNUM) || []).length >= 20) return true;
  const math = (all.match(/[0-9=+×÷√∑∫^%<>≤≥πσμλαβΣ∞±·−]/gu) || []).length;
  const tokens = all.split(/\s+/).filter(Boolean);
  const numberTokens = tokens.filter(x => /^[-–−]?\d+([.,]\d+)?[.)]?$/.test(x)).length;
  return math / letters >= MATH_CHAR_RATIO && numberTokens / Math.max(1, tokens.length) >= NUMBER_TOKEN_RATIO;
};

const cache = new Map<string, FullText | null>();
const transcribed = new Map<string, FullText | null>();

/** Seiten je KI-Aufruf beim Abschreiben und gleichzeitige Aufrufe. */
export const TRANSCRIBE_BATCH = 4;
const TRANSCRIBE_PARALLEL = 3;
/** Darüber wird nicht abgeschrieben (Budget, Dauer); dann bleibt es bei der Textebene. */
export const MAX_TRANSCRIBE_PAGES = 400;

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
    const joined = joinPages(pages);
    // Scan: Schätzung aus der Zusammenfassung, abgeschrieben wird erst beim Start.
    // Mathe: Textebene nur für die Schätzung, Karten entstehen aus der Abschrift.
    const text: FullText | null = pdf.numPages > MAX_TRANSCRIBE_PAGES
      ? joined
      : !joined
        ? { text: '', pages: pdf.numPages, transcribe: 'scan' }
        : looksMathHeavy(pages) ? { ...joined, transcribe: 'math' } : joined;
    cache.set(doc.id, text);
    return text;
  } finally {
    void pdf.doc.cleanup();
  }
};

/**
 * Seiten von Gemini abschreiben lassen (Formeln als LaTeX, richtige
 * Lesereihenfolge), in Gruppen zu TRANSCRIBE_BATCH Seiten. Scheitert eine
 * Gruppe, zählt für diese Seiten die Textebene: nie schlechter als vorher.
 * Budget-Fehler werden weitergereicht, damit der Aufrufer anhält.
 */
export const transcribePdf = async (
  doc: ProcessedDocument,
  onPage?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<FullText | null> => {
  if (transcribed.has(doc.id)) return transcribed.get(doc.id)!;
  const pdf = await loadPdf(doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content);
  try {
    const total = pdf.numPages;
    const batches: number[][] = [];
    for (let p = 1; p <= total; p += TRANSCRIBE_BATCH) {
      batches.push(Array.from({ length: Math.min(TRANSCRIBE_BATCH, total - p + 1) }, (_, i) => p + i));
    }
    const out: string[] = new Array(batches.length).fill('');
    let next = 0;
    let done = 0;
    let fatal: unknown = null;
    onPage?.(0, total);
    const worker = async () => {
      while (next < batches.length && !fatal) {
        if (isCancelled?.()) return;
        const i = next++;
        const pages = batches[i];
        try {
          const images: string[] = [];
          for (const n of pages) images.push(await renderPageToJpegBase64(pdf, n));
          out[i] = (await transcribePdfPages(images, pages[0])).trim();
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg === 'BUDGET_EXHAUSTED' || msg === 'LIMIT_REACHED') { fatal = e; return; }
          const layer: string[] = [];
          for (const n of pages) layer.push(await getPageText(pdf, n).catch(() => ''));
          out[i] = layer.map(t => t.trim()).filter(Boolean).join('\n\n');
        }
        done += pages.length;
        onPage?.(done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(TRANSCRIBE_PARALLEL, batches.length) }, worker));
    if (fatal) throw fatal;
    if (isCancelled?.()) return null;
    const text = out.filter(Boolean).join('\n\n');
    const result: FullText | null = text.trim() ? { text, pages: total } : null;
    transcribed.set(doc.id, result);
    return result;
  } finally {
    void pdf.doc.cleanup();
  }
};
