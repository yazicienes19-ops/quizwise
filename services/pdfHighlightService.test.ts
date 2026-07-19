import { describe, it, expect } from 'vitest';
import { findQuoteRects } from './pdfHighlightService';
import type { PositionedTextItem } from './pdfPageService';

// Synthetische Items: 10 Einheiten pro Zeichen, Zeilenhöhe 12
const item = (str: string, x: number, y: number): PositionedTextItem =>
  ({ str, x, y, w: str.length * 10, h: 12 });

describe('findQuoteRects', () => {
  it('findet ein Zitat innerhalb eines Fragments mit Teil-Rechteck', () => {
    const items = [item('Der Halo-Effekt überstrahlt alles', 50, 100)];
    const rects = findQuoteRects(items, 'Halo-Effekt')!;
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(50 + 4 * 10);
    expect(rects[0].w).toBeCloseTo(11 * 10);
    expect(rects[0].y).toBe(100);
  });

  it('findet ein Zitat über mehrere Fragmente hinweg (ein Rechteck je Fragment)', () => {
    const items = [item('Die klassische', 0, 0), item('Konditionierung nach Pawlow', 0, 20)];
    const rects = findQuoteRects(items, 'klassische Konditionierung')!;
    expect(rects).toHaveLength(2);
    expect(rects[1].y).toBe(20);
  });

  it('ist whitespace-tolerant (Zitat mit Umbrüchen, Seite mit Fragmentgrenzen)', () => {
    const items = [item('Lernen ist ein', 0, 0), item('aktiver  Prozess', 0, 20)];
    expect(findQuoteRects(items, 'Lernen ist\nein aktiver Prozess')).not.toBeNull();
  });

  it('strippt Anführungszeichen um das Zitat', () => {
    const items = [item('Verstärkung erhöht Verhalten', 0, 0)];
    expect(findQuoteRects(items, '„Verstärkung erhöht Verhalten"')).not.toBeNull();
  });

  it('langes Zitat: Präfix reicht zum Verorten', () => {
    const longText = 'Die operante Konditionierung beschreibt wie Konsequenzen die Auftretenswahrscheinlichkeit künftigen Verhaltens formen';
    const items = [item(longText, 0, 0)];
    const quote = longText.slice(0, 80) + ' und hier paraphrasiert die KI etwas völlig anderes am Ende';
    expect(findQuoteRects(items, quote)).not.toBeNull();
  });

  it('nicht vorhandenes Zitat und Zwerg-Zitate ergeben null', () => {
    const items = [item('Ganz anderer Inhalt', 0, 0)];
    expect(findQuoteRects(items, 'Dieses Zitat existiert nicht')).toBeNull();
    expect(findQuoteRects(items, 'a')).toBeNull();
    expect(findQuoteRects([], 'irgendwas')).toBeNull();
  });
});
