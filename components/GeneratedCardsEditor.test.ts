import { describe, it, expect } from 'vitest';
import { splitDraft } from './GeneratedCardsEditor';

describe('splitDraft', () => {
  it('übernimmt nur vollständige, nicht entfernte Karten', () => {
    const { keep, dropped } = splitDraft([
      { id: 'a', front: 'Frage', back: 'Antwort' },
      { id: 'b', front: 'weg', back: 'x', removed: true },
      { id: 'c', front: '', back: '' },                       // leer hinzugefügt
      { id: 'd', front: '{{c1::Pawlow}} und Hunde', back: '' }, // Lückentext ohne Rückseite ist ok
      { id: 'e', front: '', back: 'Aorta', frontImage: 'u/bild.webp' },
      { id: 'f', front: 'nur Frage', back: '  ' },
    ]);
    expect(keep.map(c => c.id)).toEqual(['a', 'd', 'e']);
    expect(dropped.map(c => c.id)).toEqual(['b', 'c', 'f']);
  });
});
