import { describe, it, expect } from 'vitest';
import { hasCloze, parseCloze, clozeToPlain, nextClozeNumber, wrapCloze } from './cloze';

describe('parseCloze', () => {
  it('zerlegt Ankis Schreibweise mit Nummer und Hinweis', () => {
    expect(parseCloze('Die {{c1::Amygdala}} verarbeitet {{c2::Angst::Gefühl}}.')).toEqual([
      { kind: 'text', text: 'Die ' },
      { kind: 'cloze', answer: 'Amygdala' },
      { kind: 'text', text: ' verarbeitet ' },
      { kind: 'cloze', answer: 'Angst', hint: 'Gefühl' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('akzeptiert Lücken ohne Nummer und lässt normalen Text in Ruhe', () => {
    expect(parseCloze('{{Pawlow}} und Hunde')).toEqual([{ kind: 'cloze', answer: 'Pawlow' }, { kind: 'text', text: ' und Hunde' }]);
    expect(parseCloze('Kein Lückentext {x}')).toEqual([{ kind: 'text', text: 'Kein Lückentext {x}' }]);
  });
});

describe('hasCloze', () => {
  it('ist wiederholt aufrufbar (kein hängender RegExp-Zustand)', () => {
    expect(hasCloze('a {{c1::b}}')).toBe(true);
    expect(hasCloze('a {{c1::b}}')).toBe(true);
    expect(hasCloze('nur Text')).toBe(false);
  });
});

describe('clozeToPlain', () => {
  it('füllt alle Lücken aus', () => {
    expect(clozeToPlain('Die {{c1::Amygdala}} verarbeitet {{c2::Angst::Gefühl}}.')).toBe('Die Amygdala verarbeitet Angst.');
  });
});

describe('wrapCloze', () => {
  it('macht die Auswahl zur nächsten Lücke', () => {
    const r = wrapCloze('Die {{c1::Amygdala}} verarbeitet Angst.', 33, 38);
    expect(r.text).toBe('Die {{c1::Amygdala}} verarbeitet {{c2::Angst}}.');
    expect(nextClozeNumber(r.text)).toBe(3);
  });

  it('fügt ohne Auswahl einen Platzhalter ein', () => {
    expect(wrapCloze('abc', 3, 3).text).toBe('abc{{c1::…}}');
  });
});

import { textSides } from './cloze';
describe('textSides', () => {
  it('maskiert Lücken vorn und füllt sie hinten aus', () => {
    expect(textSides({ front: 'Die {{c1::Amygdala}} verarbeitet {{c2::Angst::Gefühl}}.', back: '' }))
      .toEqual({ front: 'Die […] verarbeitet [Gefühl].', back: 'Die Amygdala verarbeitet Angst.' });
    expect(textSides({ front: 'a {{c1::b}}', back: 'Zusatz' }).back).toBe('a b\nZusatz');
    expect(textSides({ front: 'Frage', back: 'Antwort' })).toEqual({ front: 'Frage', back: 'Antwort' });
  });
});
