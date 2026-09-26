import { describe, it, expect, vi } from 'vitest';
vi.mock('./documentService', () => ({ downloadPdfAsBase64: vi.fn() }));
vi.mock('./geminiService', () => ({ transcribePdfPages: vi.fn() }));
import { joinPages, canReadFullText, looksMathHeavy } from './pdfFullText';
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

  // Echte Textebenen-Ausschnitte (26.09.2026)
  const mathBook = '1. GÜN 10 Sayı Problemleri - I 11. 17 12. 12 13. 99 14. 21 15. – 8 16. – 43 17. 54/5 18. 9 19. – 4/3 20. 2 Hangi sayının 8 eksiği 24 tür? 16 fazlası 43 ün 7 eksiğine eşit olan sayı kaçtır? A) 7 B) 13 C) 20 D) 26 E) 30';
  const statSlide = 'KOVARIANZ Kovarianz: der Durchschnitt der Abweichungsprodukte 𝒔 𝑿𝒀 = 𝒔 𝒀𝑿 = 𝟏 𝒏 ⋅ & 𝒎$𝟏 𝒏 𝒙 𝒎 − ) 𝒙 ⋅ 𝒚 𝒎 − ) 𝒚 = 𝟏 𝒏 ⋅ 𝑲𝑷𝑺 𝑿𝒀 𝒔 𝑿 𝟏 𝑿 𝟐 = 𝒔 𝑿 𝟐 𝑿 𝟏 = 𝟏 𝒏';
  const prose = 'Die Wahrnehmung ist ein aktiver Prozess, bei dem das Gehirn Sinnesreize auswählt, organisiert und interpretiert. Gestaltgesetze beschreiben, wie wir Elemente zu Einheiten gruppieren, etwa nach Nähe oder Ähnlichkeit.';
  const paper = 'The results showed that conscientiousness (r = .34, p < .01) predicted performance in 2018 more strongly than extraversion, which was attributed to the leaders by the followers in both studies and across the organisational contexts examined here.';

  it('erkennt Mathe-Bücher und Formel-Folien, aber nicht Fließtext oder Paper mit Statistikwerten', () => {
    expect(looksMathHeavy([mathBook, mathBook])).toBe(true);
    expect(looksMathHeavy([statSlide, statSlide])).toBe(true);
    expect(looksMathHeavy([prose, prose])).toBe(false);
    expect(looksMathHeavy([paper, paper])).toBe(false);
    expect(looksMathHeavy(['', ''])).toBe(false);
  });
});
