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

export interface PositionedTextItem {
  str: string;
  /** Position/Größe in Seiten-Koordinaten bei scale 1 (Ursprung oben links). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Textfragmente einer Seite mit Positionen (scale 1, Ursprung oben links) —
 * Grundlage für das Markieren von Zitat-Stellen direkt auf dem Canvas.
 */
export const getPageTextItems = async (
  pdf: PdfHandle,
  pageNumber: number
): Promise<{ items: PositionedTextItem[]; width: number; height: number }> => {
  const page = await pdf.doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PositionedTextItem[] = (content.items as any[])
    .filter(it => typeof it.str === 'string' && it.str.length > 0)
    .map(it => {
      const h = it.height || Math.abs(it.transform?.[3] ?? 0) || 10;
      return {
        str: it.str,
        x: it.transform?.[4] ?? 0,
        // transform[5] ist die Baseline in PDF-Koordinaten (Ursprung unten) —
        // umrechnen auf "oben links" und die Zeichenhöhe nach oben abtragen.
        y: viewport.height - (it.transform?.[5] ?? 0) - h,
        w: it.width ?? 0,
        h,
      };
    });
  return { items, width: viewport.width, height: viewport.height };
};

export interface PositionedLine {
  /** y-Position der Zeile (oben links, wie PositionedTextItem). */
  y: number;
  /** Zeichenhöhe des größten Fragments dieser Zeile — Grundlage für die
   *  schriftgrößenbasierte Überschriften-Erkennung dichter Textseiten. */
  height: number;
  text: string;
}

/**
 * Fasst Positions-Fragmente einer Seite zu Zeilen zusammen (Fragmente mit
 * ähnlichem y gehören zur selben Zeile) — anders als joinTextItems() bleibt
 * hier pro Zeile die Schriftgröße erhalten, nötig um echte Überschriften auf
 * textdichten Seiten von gleich aussehenden, aber fließtextgroßen
 * Aufzählungspunkten zu unterscheiden (siehe chapterService.detectDenseChapters).
 */
export function groupIntoLines(items: PositionedTextItem[]): PositionedLine[] {
  const withText = items.filter(it => it.str.trim());
  // Erst grob nach y clustern (Fragmente können innerhalb derselben Zeile
  // leicht in y schwanken, z.B. durch Font-Metrik-Jitter) — die Lesereihen-
  // folge INNERHALB einer Zeile kommt danach separat aus der x-Sortierung,
  // sonst könnte ein Fragment mit knapp höherem/niedrigerem y vor einem
  // eigentlich weiter links stehenden Fragment landen.
  const sortedByY = [...withText].sort((a, b) => a.y - b.y);
  const rawLines: PositionedTextItem[][] = [];
  for (const it of sortedByY) {
    const lastLine = rawLines[rawLines.length - 1];
    const lastItem = lastLine?.[lastLine.length - 1];
    if (lastItem && Math.abs(it.y - lastItem.y) < Math.max(it.h, lastItem.h) * 0.5) {
      lastLine.push(it);
    } else {
      rawLines.push([it]);
    }
  }
  return rawLines.map(lineItems => {
    const sortedByX = [...lineItems].sort((a, b) => a.x - b.x);
    let text = '';
    for (const it of sortedByX) {
      if (text && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
    }
    return { y: lineItems[0].y, height: Math.max(...lineItems.map(it => it.h)), text };
  });
}

/**
 * Begrenzt targetWidth so, dass eine Seite mit dem Seitenverhältnis
 * baseWidth/baseHeight bei dieser Breite nicht höher als maxHeight wird.
 * Reine Rechenfunktion (kein pdf.js/Canvas nötig) — deshalb eigenständig
 * exportiert und direkt testbar.
 */
export function constrainWidthToHeight(
  targetWidth: number,
  baseWidth: number,
  baseHeight: number,
  maxHeight?: number
): number {
  if (!maxHeight || baseHeight <= 0) return targetWidth;
  const widthForMaxHeight = maxHeight * (baseWidth / baseHeight);
  return Math.min(targetWidth, widthForMaxHeight);
}

/**
 * Rendert eine Seite scharf (devicePixelRatio) in das Canvas, skaliert auf
 * targetWidth CSS-Pixel. Optionales maxHeight begrenzt die Skalierung zusätzlich
 * über die Höhe — ohne das würde eine hochformatige Seite in einer breiten,
 * aber niedrigen Spalte über den sichtbaren Bereich hinausragen und Scrollen
 * erzwingen, obwohl "100%" eigentlich "ganze Seite ohne Scrollen" bedeuten soll.
 */
export const renderPageToCanvas = async (
  pdf: PdfHandle,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  maxHeight?: number
): Promise<void> => {
  const page = await pdf.doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const dpr = window.devicePixelRatio || 1;
  const effectiveWidth = constrainWidthToHeight(targetWidth, baseViewport.width, baseViewport.height, maxHeight);
  const scale = (effectiveWidth / baseViewport.width) * dpr;
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

/** Abstand zwischen zwei Fragmenten einer Zeile, ab dem sie als getrennte Spalten gelten. */
const columnGap = (h: number) => Math.max(30, h * 2.5);

/**
 * Seitentext in Lesereihenfolge nach Position statt nach Reihenfolge im
 * PDF-Strom: Zeilen von oben nach unten, in der Zeile von links nach rechts,
 * weit auseinanderliegende Fragmente mit " | " getrennt (Spalten). Im Strom
 * stand auf einer Folie "M = 30" (rechte Spalte, ohne Handy) vor "M = 90"
 * (linke Spalte, mit Handy); die Extraktion las die Werte dadurch vertauscht
 * (Abnahme Lernstudio, 16.10.2026).
 */
/** Überschrift des Abschnitts mit verborgenem Text (layoutPageText); Prompts und Prüfungen erkennen ihn daran. */
export const HIDDEN_TEXT_MARK = '[Verborgener Text, auf der Folie nicht sichtbar]';

/** Anteil kontrastreicher Pixel, ab dem ein Textstück als sichtbar gilt (gemessen: verdeckt 0,000, sichtbar ab 0,19). */
const MIN_INK = 0.02;

/**
 * Welche Textstücke sind auf dem gerenderten Bild nicht zu sehen? Je
 * Rechteck der Anteil Pixel, die sich deutlich (Helligkeit > 60) vom Median
 * abheben. Verdeckter oder weißer Text ergibt eine gleichmäßige Fläche.
 * Beispiel (16.10.2026): auf einer Folie stand die Lösung unter einer weißen
 * Fläche, die Textebene enthielt sie trotzdem. rgba: Pixel des Bilds in
 * Breite width, scale: Bildbreite / Seitenbreite.
 */
export function hiddenItemFlags(items: PositionedTextItem[], rgba: Uint8ClampedArray, width: number, height: number, scale: number): boolean[] {
  return items.map(it => {
    if (!it.str.trim()) return false;
    const x0 = Math.max(0, Math.floor(it.x * scale)), y0 = Math.max(0, Math.floor(it.y * scale));
    const x1 = Math.min(width, Math.ceil((it.x + it.w) * scale)), y1 = Math.min(height, Math.ceil((it.y + it.h) * scale));
    if (x1 <= x0 || y1 <= y0) return false;
    const lum: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      lum.push(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }
    const sorted = [...lum].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    return lum.filter(v => Math.abs(v - med) > 60).length / lum.length < MIN_INK;
  });
}

/**
 * Wie layoutPageText, verborgener Text (hidden[i]) steht aber getrennt am Ende
 * unter HIDDEN_TEXT_MARK: er zählt als Inhalt (oft die Lösungen der Vorlesung),
 * ist aber nie ein Folienfehler und wird verworfen, wenn er nicht zur Folie passt.
 */
export function layoutPageTextWithHidden(items: PositionedTextItem[], hidden: boolean[]): string {
  const visible = layoutPageText(items.filter((_, i) => !hidden[i]));
  const covered = layoutPageText(items.filter((_, i) => hidden[i]));
  return covered ? `${visible}\n${HIDDEN_TEXT_MARK}\n${covered}` : visible;
}

/** Sichtbarer Teil eines Seitentexts (ohne den Abschnitt mit verborgenem Text). */
export const visiblePart = (pageText: string): string => pageText.split(`\n${HIDDEN_TEXT_MARK}\n`)[0];

export function layoutPageText(items: PositionedTextItem[]): string {
  const withText = items.filter(it => it.str.trim());
  const sortedByY = [...withText].sort((a, b) => a.y - b.y);
  const lines: PositionedTextItem[][] = [];
  for (const it of sortedByY) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    // 70 % der Zeichenhöhe: Folienzeilen liegen oft ein paar Punkte schief (Überschriften zweier
    // Spalten), echte Zeilen liegen mindestens ~120 % auseinander.
    if (ref && Math.abs(it.y - ref.y) < Math.max(it.h, ref.h) * 0.7) line.push(it);
    else lines.push([it]);
  }
  return lines.map(line => {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const it of sorted) {
      const gap = it.x - end;
      if (text) text += gap > columnGap(it.h) ? ' | ' : (text.endsWith(' ') || it.str.startsWith(' ') ? '' : ' ');
      text += it.str;
      end = Math.max(end, it.x + it.w);
    }
    return text.replace(/\s+/g, ' ').trim();
  }).filter(Boolean).join('\n');
}

/**
 * Für das Lernstudio in einem Durchgang: Seitenbild (JPEG, feste Breite) und
 * Text nach Position mit verborgenem Text getrennt (Pixeltest am Bild).
 */
export const renderStudioPage = async (pdf: PdfHandle, pageNumber: number, width = 1000, quality = 0.7): Promise<{ text: string; jpeg: string }> => {
  const { items, width: pageWidth } = await getPageTextItems(pdf, pageNumber);
  const page = await pdf.doc.getPage(pageNumber);
  const scale = width / pageWidth;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const hidden = hiddenItemFlags(items, rgba, canvas.width, canvas.height, scale);
  return {
    text: layoutPageTextWithHidden(items, hidden),
    jpeg: canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/jpeg;base64,/, ''),
  };
};
