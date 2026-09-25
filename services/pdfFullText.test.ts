import { describe, it, expect, vi } from 'vitest';
vi.mock('./documentService', () => ({ downloadPdfAsBase64: vi.fn() }));
import { joinPages, canReadFullText } from './pdfFullText';
import type { ProcessedDocument } from '../types';

const text = 'Das ist eine Seite mit genug lesbarem Text für die Erkennung. '.repeat(2);

describe('pdfFullText', () => {
  it('setzt lesbare Seiten mit Leerzeile zusammen und lässt leere weg', () => {
    expect(joinPages([text, '', text])).toEqual({ text: `${text.trim()}\n\n${text.trim()}`, pages: 2 });
  });

  it('gilt als Scan, wenn weniger als die Hälfte der Seiten Text hat', () => {
    expect(joinPages([text, '', '', ''])).toBeNull();
    expect(joinPages([])).toBeNull();
  });

  it('liest nur PDFs mit Datei', () => {
    const d = (p: Partial<ProcessedDocument>) => ({ id: 'x', name: 'a', content: '', type: 'pdf', uploadDate: 0, ...p }) as ProcessedDocument;
    expect(canReadFullText(d({ storagePath: 'u/a.pdf' }))).toBe(true);
    expect(canReadFullText(d({}))).toBe(false);
    expect(canReadFullText(d({ type: 'text', content: 'x' }))).toBe(false);
  });
});
