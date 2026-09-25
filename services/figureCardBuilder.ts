import type { ProcessedDocument } from '../types';
import { generateFigureFlashcards, type GenerationSource } from './geminiService';
import { downloadPdfAsBase64 } from './documentService';
import { loadPdf } from './pdfPageService';
import { uploadCardImage } from './cardImages';
import { validateFigure, cropRect, dedupeFigures } from './figureCards';

/**
 * Abbildungs-Karten bauen: KI nennt Abbildungen (Seite + Bereich), der
 * Browser rendert die Seite, schneidet aus und lädt das Bild als Kartenbild
 * hoch. Nur für PDFs; bei allem anderen gibt es schlicht keine Abbildungen.
 */

export interface BuiltFigureCard {
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
}

/** Zielbreite der gerenderten Seite; Ausschnitte bleiben damit scharf. */
const RENDER_WIDTH = 1800;

export const canUseFigures = (doc: ProcessedDocument | undefined): boolean =>
  !!doc && doc.type === 'pdf' && !!(doc.storagePath || doc.content);

export const buildFigureCards = async (
  doc: ProcessedDocument,
  userId: string,
  max: number,
  onProgress?: (done: number, total: number) => void,
): Promise<BuiltFigureCard[]> => {
  const source: GenerationSource = doc.storagePath
    ? { storagePath: doc.storagePath, mimeType: 'application/pdf' }
    : { file: { data: doc.content, mimeType: 'application/pdf' } };

  // KI-Aufruf und PDF-Laden parallel, beides dauert.
  const [raw, pdf] = await Promise.all([
    generateFigureFlashcards(source, max),
    (async () => loadPdf(doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content))(),
  ]);
  const figures = dedupeFigures(
    raw.map(r => validateFigure(r as Record<string, unknown>, pdf.numPages)).filter((f): f is NonNullable<typeof f> => !!f),
  );

  const out: BuiltFigureCard[] = [];
  onProgress?.(0, figures.length);
  for (const [i, fig] of figures.entries()) {
    try {
      const page = await pdf.doc.getPage(fig.page);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.round(viewport.width);
      pageCanvas.height = Math.round(viewport.height);
      const pctx = pageCanvas.getContext('2d');
      if (!pctx) continue;
      await page.render({ canvas: pageCanvas, canvasContext: pctx, viewport }).promise;

      const { sx, sy, sw, sh } = cropRect(fig.box, pageCanvas.width, pageCanvas.height);
      const crop = document.createElement('canvas');
      crop.width = sw; crop.height = sh;
      const cctx = crop.getContext('2d');
      if (!cctx) continue;
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0, 0, sw, sh);
      cctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob | null>(r => crop.toBlob(r, 'image/png'));
      if (!blob) continue;
      const file = new File([blob], `abbildung-s${fig.page}.png`, { type: 'image/png' });
      const path = await uploadCardImage(userId, `fig${Date.now().toString(36)}${i}`, file);
      out.push(fig.side === 'front'
        ? { front: fig.front, back: fig.back, frontImage: path }
        : { front: fig.front, back: fig.back, backImage: path });
    } catch {
      // Eine Abbildung, die sich nicht ausschneiden oder hochladen lässt, fällt weg.
    } finally {
      onProgress?.(i + 1, figures.length);
    }
  }
  return out;
};
