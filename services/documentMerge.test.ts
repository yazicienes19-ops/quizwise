import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ProcessedDocument } from '../types';

const files = new Map<string, string>();
vi.mock('./documentService', () => ({ downloadPdfAsBase64: async (path: string) => files.get(path)! }));
vi.mock('./libraryService', () => ({ documentDisplayName: (d: { name: string }) => d.name.replace(/\.[^/.]+$/, '') }));

import { buildMergedFile, mergeKind, sortByDisplayName, suggestMergedName } from './documentMerge';

const makePdf = async (pages: number): Promise<string> => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save()).toString('base64');
};

const doc = (id: string, name: string, type: ProcessedDocument['type'] = 'pdf', content = ''): ProcessedDocument =>
  ({ id, name, type, content, uploadDate: 0, ...(type === 'pdf' ? { storagePath: id } : {}) });

describe('documentMerge', () => {
  it('fügt PDFs in Reihenfolge zusammen, je Vorlesung ein Gliederungseintrag auf ihrer ersten Seite', async () => {
    files.set('a', await makePdf(2));
    files.set('b', await makePdf(3));
    const file = await buildMergedFile([doc('a', 'VL 1.pdf'), doc('b', 'VL 2 Gedächtnis.pdf')], 'Allgemeine (gesamt)');
    expect(file.name).toBe('Allgemeine (gesamt).pdf');

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    expect(pdf.numPages).toBe(5);
    const outline = await pdf.getOutline();
    expect(outline.map(o => o.title)).toEqual(['VL 1', 'VL 2 Gedächtnis']);
    const pageOf = async (dest: unknown) => (await pdf.getPageIndex((dest as [{ num: number; gen: number }])[0])) + 1;
    expect(await pageOf(outline[0].dest)).toBe(1);
    expect(await pageOf(outline[1].dest)).toBe(3);
  });

  it('fügt Texte mit Überschriften zusammen', async () => {
    const file = await buildMergedFile([doc('x', 'Teil A.txt', 'text', 'Inhalt A'), doc('y', 'Teil B.docx', 'docx', 'Inhalt B')], 'Skript');
    expect(file.name).toBe('Skript.txt');
    expect(await file.text()).toBe('# Teil A\n\nInhalt A\n\n\n# Teil B\n\nInhalt B');
  });

  it('erkennt Mischungen und sortiert natürlich', () => {
    expect(mergeKind([doc('a', 'a.pdf'), doc('b', 'b.txt', 'text')])).toBeNull();
    expect(mergeKind([doc('a', 'a.pdf'), doc('b', 'b.png', 'image')])).toBe('pdf');
    expect(sortByDisplayName([doc('a', 'VL 10.pdf'), doc('b', 'VL 2.pdf')]).map(d => d.id)).toEqual(['b', 'a']);
    expect(suggestMergedName([doc('a', 'Vorlesung 1.pdf'), doc('b', 'Vorlesung 2.pdf')], 'Fach')).toBe('Vorlesung (gesamt)');
    expect(suggestMergedName([doc('a', 'Heißner.pdf'), doc('b', 'Lindauer.pdf')], 'Fach')).toBe('Fach (gesamt)');
  });
});
