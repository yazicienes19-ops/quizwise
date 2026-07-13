import type { PDFDocumentProxy } from 'pdfjs-dist';
// Nur die URL des Workers wird statisch importiert (winziger String) —
// die eigentliche pdfjs-Bibliothek (~400 KB) lädt erst beim Öffnen eines PDFs.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Seiten mit weniger extrahierbarem Text gelten als Scan (Foto/Bild-PDF ohne Textebene). */
export const SCANNED_PAGE_TEXT_THRESHOLD = 50;

export interface PdfHandle {
  doc: PDFDocumentProxy;
  numPages: number;
  /** Extrahierter Text pro Seite (1-basiert), gecacht nach erstem Zugriff. */
  pageTextCache: Map<number, string>;
}

/**
 * Safari kann ReadableStreams nicht mit `for await` iterieren (kein
 * Symbol.asyncIterator auf dem Prototyp) — pdf.js nutzt das aber in
 * getTextContent(). Ohne Polyfill schlägt dort jede Textextraktion mit
 * "undefined is not a function (near '...value of readableStream...')" fehl.
 */
const polyfillReadableStreamAsyncIterator = () => {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype as any;
  if (proto[Symbol.asyncIterator]) return;
  proto[Symbol.asyncIterator] = function () {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const result = await reader.read();
          if (result.done) reader.releaseLock();
          return result;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value: unknown) {
        const cancelPromise = reader.cancel(value);
        reader.releaseLock();
        await cancelPromise;
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
};

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

const getPdfjs = () => {
  if (!pdfjsPromise) {
    polyfillReadableStreamAsyncIterator();
    pdfjsPromise = import('pdfjs-dist').then(m => {
      m.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return m;
    });
  }
  return pdfjsPromise;
};

const base64ToBytes = (base64: string): Uint8Array => {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return bytes;
};

export const loadPdf = async (base64: string): Promise<PdfHandle> => {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: base64ToBytes(base64) }).promise;
  return { doc, numPages: doc.numPages, pageTextCache: new Map() };
};

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

/**
 * Fügt pdf.js-Textfragmente zu lesbarem Fließtext zusammen. pdf.js liefert
 * den Seitentext als einzelne Positions-Fragmente — Leerzeichen zwischen
 * Fragmenten und Zeilenumbrüche (hasEOL) müssen selbst rekonstruiert werden.
 */
export function joinTextItems(items: TextItemLike[]): string {
  let out = '';
  for (const item of items) {
    if (item.str) {
      if (out && !out.endsWith('\n') && !out.endsWith(' ') && !item.str.startsWith(' ')) out += ' ';
      out += item.str;
    }
    if (item.hasEOL && !out.endsWith('\n')) out += '\n';
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

export function isScannedPage(pageText: string): boolean {
  return pageText.trim().length < SCANNED_PAGE_TEXT_THRESHOLD;
}

export const getPageText = async (pdf: PdfHandle, pageNumber: number): Promise<string> => {
  const cached = pdf.pageTextCache.get(pageNumber);
  if (cached !== undefined) return cached;
  const page = await pdf.doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = joinTextItems(content.items as TextItemLike[]);
  pdf.pageTextCache.set(pageNumber, text);
  return text;
};

/** Rendert eine Seite scharf (devicePixelRatio) in das Canvas, skaliert auf targetWidth CSS-Pixel. */
export const renderPageToCanvas = async (
  pdf: PdfHandle,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number
): Promise<void> => {
  const page = await pdf.doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const dpr = window.devicePixelRatio || 1;
  const scale = (targetWidth / baseViewport.width) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / dpr}px`;
  canvas.style.height = `${viewport.height / dpr}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
};

/**
 * Rendert eine Seite als JPEG-Base64 (ohne data:-Präfix) — Fallback für
 * Scan-Seiten ohne Textebene: das Bild geht dann direkt an die Analyse.
 */
export const renderPageToJpegBase64 = async (pdf: PdfHandle, pageNumber: number): Promise<string> => {
  const page = await pdf.doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.8).replace(/^data:image\/jpeg;base64,/, '');
};
