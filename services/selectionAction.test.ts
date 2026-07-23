import { describe, it, expect } from 'vitest';
import { detectSelectionAction } from './selectionAction';

describe('detectSelectionAction', () => {
  it('erkennt ein einzelnes Wort als Begriff', () => {
    expect(detectSelectionAction('Falsifikationsprinzip')).toBe('term');
  });

  it('erkennt bis zu 3 Wörter noch als Begriff', () => {
    expect(detectSelectionAction('selektive Aufmerksamkeit')).toBe('term');
    expect(detectSelectionAction('Halo-Effekt und Horn-Effekt')).toBe('term');
  });

  it('erkennt 4+ Wörter als Verständnisfrage/Satz, nicht mehr als Begriff', () => {
    expect(detectSelectionAction('Der Halo-Effekt beschreibt ein Phänomen')).toBe('ask');
  });

  it('erkennt einen normalen Satz als "ask"', () => {
    const sentence = 'Selektive Aufmerksamkeit filtert relevante Reize heraus, während irrelevante Informationen unterdrückt werden.';
    expect(detectSelectionAction(sentence)).toBe('ask');
  });

  it('erkennt eine lange, mehrsätzige Passage als "summarize"', () => {
    const paragraph = Array.from({ length: 60 }, (_, i) => `Wort${i}`).join(' ');
    expect(detectSelectionAction(paragraph)).toBe('summarize');
  });

  it('behandelt die Grenzwerte korrekt (genau 3 vs. 4, genau 50 vs. 51 Wörter)', () => {
    const threeWords = 'eins zwei drei';
    const fourWords = 'eins zwei drei vier';
    expect(detectSelectionAction(threeWords)).toBe('term');
    expect(detectSelectionAction(fourWords)).toBe('ask');

    const fiftyWords = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const fiftyOneWords = Array.from({ length: 51 }, (_, i) => `w${i}`).join(' ');
    expect(detectSelectionAction(fiftyWords)).toBe('ask');
    expect(detectSelectionAction(fiftyOneWords)).toBe('summarize');
  });

  it('ignoriert doppelte Leerzeichen/Zeilenumbrüche bei der Wortzählung', () => {
    expect(detectSelectionAction('eins   zwei\n\ndrei')).toBe('term');
  });

  it('behandelt leeren/reinen Whitespace-Text ohne Crash (0 Wörter zählt als Begriff)', () => {
    expect(detectSelectionAction('   ')).toBe('term');
  });
});
