import type { ProcessedDocument } from '../types';
import { cropRect } from './figureCards';
import type { DocFigure, FigureIndex } from './studioFigureCatalog';
export type { DocFigure, FigureIndex } from './studioFigureCatalog';
export { buildFigureCatalog, figurePromptBlock, validateStudioFigure, dedupeStudioFigures, type CatalogEntry } from './studioFigureCatalog';
import { validateStudioFigure, dedupeStudioFigures } from './studioFigureCatalog';
import { findStudioFigures } from './geminiService';
import type { RawStudioFigure } from './studioFigureCatalog';
import { downloadPdfAsBase64, saveFigureIndexToSupabase } from './documentService';
import { loadPdf, type PdfHandle } from './pdfPageService';
import { uploadCardImage } from './cardImages';
import { splitDiagrams, diagramToBlock } from './studioDiagrams';
import type { CatalogEntry } from './studioFigureCatalog';

/**
 * Abbildungen aus dem Skript im Lernstudio (Zusammenfassung, Lernleitfaden).
 *
 * 1. Einmal pro PDF: Gemini listet die lernrelevanten Abbildungen (Seite,
 *    Bildbereich, Titel, Beschreibung). Das Verzeichnis wird am Dokument
 *    gespeichert (documents.figure_index, migration_figure_index.sql) und
 *    lokal zwischengespeichert, damit weitere Ergebnisse nichts mehr kosten.
 * 2. Beim Schreiben bekommt das Modell das Verzeichnis und setzt passende
 *    Abbildungen als ```diagram {"type":"figure","ref":"A3"}``` ein.
 * 3. Danach schneidet der Browser genau diese Abbildungen aus der Seite aus
 *    und legt sie im privaten Bild-Speicher ab (wie Bildkarten).
 */

/** Höchstens so viele Abbildungen je Dokument im Verzeichnis. */
export const MAX_FIGURES_PER_DOC = 40;
/** Seiten je Paket, wenn das PDF als Seitenbilder gelesen wird. */
export const FIGURE_SCAN_BATCH = 12;
const THUMB_WIDTH = 900;
const CROP_WIDTH = 1800;

// ── Browser: Verzeichnis laden, erstellen, Bilder ausschneiden ──────────────

const cacheKey = (userId: string | undefined) => `studearc_figure_index_${userId ?? 'local'}`;

const readCache = (userId: string | undefined): Record<string, FigureIndex> => {
  try { return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '{}') as Record<string, FigureIndex>; } catch { return {}; }
};

const storeIndex = (userId: string | undefined, docId: string, index: FigureIndex) => {
  const all = readCache(userId);
  all[docId] = index;
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(all)); } catch { /* Speicher voll: Cloud reicht */ }
  if (userId) void saveFigureIndexToSupabase(docId, index).catch(() => {});
};

export const cachedFigureIndex = (doc: ProcessedDocument, userId: string | undefined): FigureIndex | null => {
  const local = readCache(userId)[doc.id];
  const cloud = doc.figureIndex ?? null;
  if (!local) return cloud;
  if (!cloud) return local;
  return local.scannedAt >= cloud.scannedAt ? local : cloud;
};

const pdfCache = new Map<string, Promise<PdfHandle>>();
/** PDF einmal je Sitzung laden (auch für die Kapitel im Lernstudio, services/studioChapters.ts). */
export const openPdf = (doc: ProcessedDocument): Promise<PdfHandle> => {
  if (!pdfCache.has(doc.id)) {
    const p = (async () => loadPdf(doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content))();
    p.catch(() => pdfCache.delete(doc.id));
    pdfCache.set(doc.id, p);
  }
  return pdfCache.get(doc.id)!;
};

const renderPage = async (pdf: PdfHandle, pageNumber: number, width: number): Promise<HTMLCanvasElement> => {
  const page = await pdf.doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
};

/** Das Backend nimmt höchstens 18 MB Dateien je Aufruf; dann seitenweise. */
const isTooLarge = (e: unknown) => /zu groß|too large|413|payload/i.test(String((e as Error)?.message ?? e));

/**
 * Verzeichnis eines PDFs holen oder erstellen. Erst das ganze PDF in einem
 * Aufruf, bei zu großen Dateien Seitenbilder in Paketen.
 */
export const ensureFigureIndex = async (
  doc: ProcessedDocument,
  userId: string | undefined,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<FigureIndex | null> => {
  const cached = cachedFigureIndex(doc, userId);
  if (cached) return cached;
  if (doc.type !== 'pdf' || !(doc.storagePath || doc.content)) return null;

  const pdf = await openPdf(doc);
  let raw: RawStudioFigure[] = [];
  try {
    const source = doc.storagePath
      ? { storagePath: doc.storagePath, mimeType: 'application/pdf' }
      : { file: { data: doc.content, mimeType: 'application/pdf' } };
    raw = await findStudioFigures({ source }, MAX_FIGURES_PER_DOC);
  } catch (e) {
    if (!isTooLarge(e)) throw e;
    const batches = Math.ceil(pdf.numPages / FIGURE_SCAN_BATCH);
    for (let b = 0; b < batches; b++) {
      if (isCancelled?.()) return null;
      onProgress?.(b, batches);
      const first = b * FIGURE_SCAN_BATCH + 1;
      const last = Math.min(pdf.numPages, first + FIGURE_SCAN_BATCH - 1);
      const pages: string[] = [];
      for (let p = first; p <= last; p++) {
        const canvas = await renderPage(pdf, p, THUMB_WIDTH);
        pages.push(canvas.toDataURL('image/jpeg', 0.6).replace(/^data:image\/jpeg;base64,/, ''));
      }
      try { raw.push(...await findStudioFigures({ pages, firstPage: first }, 8)); } catch { /* ein Paket ohne Ergebnis */ }
    }
    onProgress?.(batches, batches);
  }
  const figures = dedupeStudioFigures(
    raw.map((r, i) => validateStudioFigure(r, pdf.numPages, i)).filter((f): f is DocFigure => !!f),
  ).slice(0, MAX_FIGURES_PER_DOC);
  const index: FigureIndex = { v: 1, scannedAt: Date.now(), figures };
  storeIndex(userId, doc.id, index);
  return index;
};

/** Abbildung ausschneiden und hochladen (einmal; danach steht der Pfad im Verzeichnis). */
export const ensureFigureImage = async (doc: ProcessedDocument, figure: DocFigure, userId: string): Promise<string> => {
  const index = cachedFigureIndex(doc, userId);
  const known = index?.figures.find(f => f.id === figure.id)?.image;
  if (known) return known;
  const pdf = await openPdf(doc);
  const pageCanvas = await renderPage(pdf, figure.page, CROP_WIDTH);
  const { sx, sy, sw, sh } = cropRect(figure.box, pageCanvas.width, pageCanvas.height);
  const crop = document.createElement('canvas');
  crop.width = sw; crop.height = sh;
  const ctx = crop.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise<Blob | null>(r => crop.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Ausschnitt fehlgeschlagen.');
  const path = await uploadCardImage(userId, `stu-${doc.id}-${figure.id}`, new File([blob], `abbildung-s${figure.page}.png`, { type: 'image/png' }));
  if (index) storeIndex(userId, doc.id, { ...index, figures: index.figures.map(f => (f.id === figure.id ? { ...f, image: path } : f)) });
  return path;
};

/**
 * Nach dem Schreiben: Verweise {"type":"figure","ref":"A3"} in echte Bilder
 * verwandeln (ausschneiden, hochladen). Unbekannte Verweise und Abbildungen,
 * die sich nicht ausschneiden lassen, fallen weg; der Text bleibt.
 */
export const resolveFigureBlocks = async (
  markdown: string,
  entries: CatalogEntry[],
  documents: ProcessedDocument[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ markdown: string; placed: number; dropped: number }> => {
  const segments = splitDiagrams(markdown);
  const pending = segments.filter(s => s.type === 'diagram' && s.diagram.type === 'figure' && s.diagram.ref && !s.diagram.image).length;
  let done = 0;
  let placed = 0;
  let dropped = 0;
  const used = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.type === 'md') { out.push(seg.text); continue; }
    const d = seg.diagram;
    if (d.type !== 'figure' || d.image) { out.push(diagramToBlock(d)); continue; }
    const entry = entries.find(e => e.ref === d.ref);
    const doc = entry && documents.find(x => x.id === entry.docId);
    // Jede Abbildung nur einmal, auch wenn das Modell sie zweimal setzt.
    if (!entry || !doc || used.has(entry.ref)) { dropped += 1; continue; }
    try {
      const image = await ensureFigureImage(doc, entry.figure, userId);
      used.add(entry.ref);
      placed += 1;
      out.push(diagramToBlock({
        type: 'figure', image, docId: doc.id, page: entry.figure.page, title: entry.figure.title,
        ...(d.caption ? { caption: d.caption } : {}), cite: [{ n: entry.n, page: entry.figure.page }],
      }));
    } catch {
      dropped += 1;
    } finally {
      onProgress?.(++done, pending);
    }
  }
  return { markdown: out.join('\n\n'), placed, dropped };
};
