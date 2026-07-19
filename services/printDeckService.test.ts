import { describe, it, expect } from 'vitest';
import { buildSheets, mirrorSlots, buildPrintHtml, CARDS_PER_SHEET } from './printDeckService';
import type { Flashcard } from '../types';

const mkCards = (n: number): Flashcard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `F${i + 1}`, back: `B${i + 1}`, level: 0, nextReview: 0 }));

describe('printDeckService', () => {
  it('mirrorSlots spiegelt die Spalten jeder Zeile (Duplex-Ausrichtung)', () => {
    expect(mirrorSlots([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2, 1, 4, 3, 6, 5, 8, 7]);
  });

  it('voller Bogen: Rückseite von Karte 1 liegt am gespiegelten Platz', () => {
    const [sheet] = buildSheets(mkCards(8));
    expect(sheet.fronts.map(s => s?.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sheet.backs.map(s => s?.number)).toEqual([2, 1, 4, 3, 6, 5, 8, 7]);
  });

  it('teilbelegter Bogen: Leerplätze wandern mit an die gespiegelte Position', () => {
    const [sheet] = buildSheets(mkCards(3));
    expect(sheet.fronts.map(s => s?.number ?? null)).toEqual([1, 2, 3, null, null, null, null, null]);
    expect(sheet.backs.map(s => s?.number ?? null)).toEqual([2, 1, null, 3, null, null, null, null]);
  });

  it('mehrere Bögen, fortlaufende Nummern', () => {
    const sheets = buildSheets(mkCards(CARDS_PER_SHEET + 2));
    expect(sheets).toHaveLength(2);
    expect(sheets[1].fronts.map(s => s?.number ?? null)).toEqual([9, 10, null, null, null, null, null, null]);
  });

  it('leeres Deck ergibt keine Bögen', () => {
    expect(buildSheets([])).toEqual([]);
  });

  it('HTML escaped Kartentexte und enthält beide Seiten', () => {
    const html = buildPrintHtml('Deck <X>', [{ id: 'c1', front: 'A < B', back: 'Zeile1\nZeile2', level: 0, nextReview: 0 }], { hint: 'H', print: 'P' });
    expect(html).toContain('Deck &lt;X&gt;');
    expect(html).toContain('A &lt; B');
    expect(html).toContain('Zeile1<br>Zeile2');
    expect((html.match(/class="sheet"/g) || [])).toHaveLength(2);
  });
});
