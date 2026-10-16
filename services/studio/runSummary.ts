import type { ProcessedDocument } from '../../types';
import { documentDisplayName } from '../libraryService';
import { canReadFullText, readPdfPages } from '../pdfFullText';
import { streamStudioStep } from '../geminiService';
import { ensureFigureIndex, ensureFigureImage, buildFigureCatalog, openPdf, type DocFigure } from '../studioFigures';
import { getMergedPdfParts } from '../pdfOutlineService';
import type { StudioSourceRef } from '../studioStore';
import { runSummaryPipeline } from './pipeline';
import { extractionCache } from './cache';
import { resultToMarkdown } from './toMarkdown';
import type { LernstudioResult, PipelineProgress, PipelineSource, SourcePart } from './types';
import { guardedLlm, type LlmEvent, type StudioLlm } from './llm';

/**
 * Verbindung der Pipeline mit der App: PDFs seitenweise lesen, Abbildungen
 * (auf Wunsch), Modell über das Backend, Extraktions-Cache je Konto, danach
 * Abbildungen ausschneiden und die Textfassung für Export/alte Apps bauen.
 */

export type SummaryProgress =
  | PipelineProgress
  | { step: 'pdf'; done: number; total: number }
  | { step: 'figures'; done: number; total: number; name?: string }
  | { step: 'crop'; done: number; total: number };

const plainText = (d: ProcessedDocument): string | undefined => {
  if (d.digestStatus === 'ready' && d.digestText?.trim()) return d.digestText.trim();
  if ((d.type === 'text' || d.type === 'docx') && d.content?.trim()) return d.content.trim();
  return undefined;
};

/** Modell über das Backend, gestreamt und mit Kostenbremse gegen Schleifen. */
export const makeAppStudioLlm = (onEvent?: (e: LlmEvent) => void): StudioLlm =>
  guardedLlm((req, onText, signal) => streamStudioStep(req, onText, signal), { onEvent });

export const runSummaryForDocs = async (opts: {
  chosen: ProcessedDocument[];
  allDocuments: ProcessedDocument[];
  scope: (id: string) => { ranges?: [number, number][]; label?: string };
  userId?: string;
  focus: string;
  withFigures: boolean;
  argon: boolean;
  onProgress: (p: SummaryProgress) => void;
  isCancelled: () => boolean;
  llm?: StudioLlm;
}): Promise<{ result: LernstudioResult; markdown: string; sources: StudioSourceRef[] } | null> => {
  const { chosen, scope, userId, onProgress, isCancelled } = opts;

  // Seiten lesen (vollständig; die Kapitelwahl wendet die Pipeline an).
  const pdfs = chosen.filter(canReadFullText);
  const pagesById = new Map<string, string[] | null>();
  const partsById = new Map<string, SourcePart[]>();
  for (const [i, d] of pdfs.entries()) {
    if (isCancelled()) return null;
    onProgress({ step: 'pdf', done: i, total: pdfs.length });
    try { pagesById.set(d.id, await readPdfPages(d, isCancelled)); } catch { pagesById.set(d.id, null); }
    // Zusammengefügte PDF: Vorlesungen aus der Gliederung (Abdeckung je Vorlesung, Fußnote mit Folie).
    try { const parts = await getMergedPdfParts(await openPdf(d)); if (parts) partsById.set(d.id, parts); } catch { /* ohne */ }
  }

  // Abbildungsverzeichnis (nur auf Wunsch und mit Login).
  const figureDocs: { docId: string; n: number; figures: DocFigure[] }[] = [];
  if (opts.withFigures && userId) {
    for (const [i, d] of pdfs.entries()) {
      if (isCancelled()) return null;
      onProgress({ step: 'figures', done: 0, total: 0, name: documentDisplayName(d) });
      try {
        const index = await ensureFigureIndex(d, userId, (done, total) => onProgress({ step: 'figures', done, total, name: documentDisplayName(d) }), isCancelled);
        const ranges = scope(d.id).ranges;
        const figs = (index?.figures ?? []).filter(f => !ranges || ranges.some(([a, b]) => f.page >= a && f.page <= b));
        if (figs.length) figureDocs.push({ docId: d.id, n: i + 1, figures: figs });
      } catch { /* ohne Abbildungen weiter */ }
    }
  }
  const catalog = buildFigureCatalog(figureDocs);

  const sources: PipelineSource[] = chosen.map(d => {
    const pages = pagesById.get(d.id) ?? null;
    return {
      docId: d.id,
      name: scope(d.id).label ?? documentDisplayName(d),
      pages,
      ...(pages ? {} : { plain: plainText(d) }),
      pageCount: pages?.length ?? 0,
      ...(partsById.has(d.id) ? { parts: partsById.get(d.id) } : {}),
      figures: catalog.entries.filter(e => e.docId === d.id)
        .map(e => ({ ref: e.ref, page: e.figure.page, title: e.figure.title, description: e.figure.description })),
    };
  });
  const ranges = new Map<string, [number, number][]>();
  for (const d of chosen) { const r = scope(d.id).ranges; if (r?.length) ranges.set(d.id, r); }

  const result = await runSummaryPipeline({
    sources, ranges, focus: opts.focus, argon: opts.argon,
    llm: opts.llm ?? makeAppStudioLlm(), cache: extractionCache(userId),
    onProgress, isCancelled,
  });

  // Abbildungen ausschneiden: Katalogverweis (A3) → Pfad im Bild-Speicher; was scheitert, fällt weg.
  const figureBlocks = result.blocks.filter(b => b.type === 'figure');
  if (figureBlocks.length && userId) {
    let done = 0;
    const keep = new Set<string>();
    for (const b of figureBlocks) {
      if (b.type !== 'figure') continue;
      onProgress({ step: 'crop', done, total: figureBlocks.length });
      const entry = catalog.entries.find(e => e.ref === b.imageRef);
      const doc = entry && opts.allDocuments.find(x => x.id === entry.docId);
      if (entry && doc) {
        try { b.imageRef = await ensureFigureImage(doc, entry.figure, userId); keep.add(b.id); } catch { /* weglassen */ }
      }
      done += 1;
    }
    result.blocks = result.blocks.filter(b => b.type !== 'figure' || keep.has(b.id));
  }

  const refs: StudioSourceRef[] = sources.map((s, i) => ({ n: i + 1, docId: s.docId, name: s.name, ...(s.parts ? { parts: s.parts } : {}) }));
  const numberOf = (id: string) => refs.find(r => r.docId === id)?.n;
  return { result, markdown: resultToMarkdown(result, numberOf, refs), sources: refs };
};
