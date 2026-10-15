import type { ProcessedDocument } from '../types';
import { downloadPdfAsBase64 } from './documentService';
import { documentDisplayName } from './libraryService';

/**
 * Mehrere Vorlesungen zu EINEM Dokument zusammenfügen (Bibliothek, 15.10.2026).
 * PDFs und Bilder werden zu einem PDF, in dem jede Quelle ein Gliederungseintrag
 * ist (Lernstudio und Reader erkennen sie über pdfOutlineService als Kapitel).
 * Texte und DOCX werden zu einem Text mit Überschriften. Das Ergebnis ist eine
 * normale Datei und läuft durch den regulären Upload (Speicher, Analyse, Limit).
 */

export type MergeKind = 'pdf' | 'text';

export const mergeKindOf = (doc: ProcessedDocument): MergeKind =>
  doc.type === 'pdf' || doc.type === 'image' ? 'pdf' : 'text';

/** Gemeinsame Art aller gewählten Dokumente; null bei Mischung aus PDF/Bild und Text. */
export const mergeKind = (docs: ProcessedDocument[]): MergeKind | null => {
  if (docs.length === 0) return null;
  const kinds = new Set(docs.map(mergeKindOf));
  return kinds.size === 1 ? [...kinds][0] : null;
};

/** Natürliche Reihenfolge ("VL 2" vor "VL 10"). */
export const sortByDisplayName = (docs: ProcessedDocument[]): ProcessedDocument[] =>
  [...docs].sort((a, b) => documentDisplayName(a).localeCompare(documentDisplayName(b), 'de', { numeric: true, sensitivity: 'base' }));

/** Vorschlag für den Namen: gemeinsamer Anfang der Titel, sonst Fachname. */
export const suggestMergedName = (docs: ProcessedDocument[], fallback: string): string => {
  const names = docs.map(documentDisplayName);
  if (names.length === 0) return fallback;
  let prefix = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i].toLowerCase() === n[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  prefix = prefix.replace(/[\s\d._:,(\-–]+$/, '').trim();
  return prefix.length >= 4 ? `${prefix} (gesamt)` : `${fallback} (gesamt)`;
};

export const MAX_MERGED_BYTES = 50 * 1024 * 1024;

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const loadBytes = async (doc: ProcessedDocument): Promise<Uint8Array> => {
  if (doc.storagePath) return base64ToBytes(await downloadPdfAsBase64(doc.storagePath));
  if (doc.content) return base64ToBytes(doc.content.replace(/^data:[^,]*,/, ''));
  throw new Error(`Datei nicht verfügbar: ${doc.name}`);
};

/** Bilder als JPEG (pdf-lib kann kein WebP); über Canvas, damit jedes Browserformat geht. */
const imageToJpeg = async (bytes: Uint8Array, mime: string): Promise<{ data: Uint8Array; width: number; height: number }> => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Bild ließ sich nicht umwandeln.');
  return { data: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height };
};

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Zusammengefügt';

export type MergeProgress = { done: number; total: number };

const mergeToPdf = async (docs: ProcessedDocument[], name: string, onProgress?: (p: MergeProgress) => void): Promise<File> => {
  const { PDFDocument, PDFName, PDFHexString } = await import('pdf-lib');
  const out = await PDFDocument.create();
  out.setTitle(name);
  const starts: { title: string; pageIndex: number }[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    onProgress?.({ done: i, total: docs.length });
    const bytes = await loadBytes(doc);
    const pageIndex = out.getPageCount();
    if (doc.type === 'image') {
      const img = await imageToJpeg(bytes, doc.mimeType ?? 'image/jpeg');
      const embedded = await out.embedJpg(img.data);
      const page = out.addPage([img.width, img.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    starts.push({ title: documentDisplayName(doc), pageIndex });
  }
  onProgress?.({ done: docs.length, total: docs.length });

  // Gliederung: ein Eintrag je Vorlesung, Sprungziel = ihre erste Seite.
  const ctx = out.context;
  const outlinesRef = ctx.nextRef();
  const itemRefs = starts.map(() => ctx.nextRef());
  const allPages = out.getPages();
  starts.forEach((s, i) => {
    ctx.assign(itemRefs[i], ctx.obj({
      Title: PDFHexString.fromText(s.title),
      Parent: outlinesRef,
      Dest: [allPages[s.pageIndex].ref, 'Fit'],
      ...(i > 0 ? { Prev: itemRefs[i - 1] } : {}),
      ...(i < starts.length - 1 ? { Next: itemRefs[i + 1] } : {}),
    }));
  });
  ctx.assign(outlinesRef, ctx.obj({
    Type: 'Outlines',
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: itemRefs.length,
  }));
  out.catalog.set(PDFName.of('Outlines'), outlinesRef);
  out.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

  const saved = await out.save();
  return new File([saved], `${safeFileName(name)}.pdf`, { type: 'application/pdf' });
};

const mergeToText = (docs: ProcessedDocument[], name: string): File => {
  const body = docs
    .map(d => `# ${documentDisplayName(d)}\n\n${(d.content ?? '').trim()}`)
    .join('\n\n\n');
  return new File([body], `${safeFileName(name)}.txt`, { type: 'text/plain' });
};

/** Baut die zusammengefügte Datei in der angegebenen Reihenfolge. */
export const buildMergedFile = async (
  docs: ProcessedDocument[],
  name: string,
  onProgress?: (p: MergeProgress) => void,
): Promise<File> => {
  const kind = mergeKind(docs);
  if (!kind) throw new Error('MIXED_KINDS');
  return kind === 'pdf' ? mergeToPdf(docs, name, onProgress) : mergeToText(docs, name);
};
