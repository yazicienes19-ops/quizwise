import type { ProcessedDocument } from '../types';
import { readPdfPages } from './pdfFullText';
import { getPdfChaptersOrWhole } from './pdfOutlineService';
import { openPdf } from './studioFigures';
import { chaptersFromDetected, splitPagesIntoSections, type StudioChapter } from './subjectStudio';

/**
 * Kapitel eines PDFs fürs Lernstudio: dieselbe Erkennung wie im Reader
 * (eingebettetes Inhaltsverzeichnis, sonst Titelfolien). Findet sie keine
 * Kapitel, teilt die App lange PDFs in Abschnitte, die je in einen Durchgang
 * passen. null: PDF ist kurz genug am Stück oder ohne lesbare Textebene.
 */
const cache = new Map<string, Promise<StudioChapter[] | null>>();

export const loadStudioChapters = (doc: ProcessedDocument): Promise<StudioChapter[] | null> => {
  if (!cache.has(doc.id)) {
    const p = (async () => {
      const pages = await readPdfPages(doc);
      if (!pages) return null;
      const chapters = chaptersFromDetected(await getPdfChaptersOrWhole(await openPdf(doc)));
      if (chapters.length >= 2) return chapters;
      const sections = splitPagesIntoSections(pages);
      return sections.length >= 2 ? sections : null;
    })();
    p.catch(() => cache.delete(doc.id));
    cache.set(doc.id, p);
  }
  return cache.get(doc.id)!;
};
