import { describe, it, expect } from 'vitest';
import type { Block, Unit } from './types';
import {
  checkCites, checkCoverage, checkLength, checkNumbers, checkAuthorYears, checkTruncated, checkCiteDensity, checkKiFacts,
  type ValidationContext,
} from './validate';
import { extractFacts, looksTruncated, authorYears, countWords } from './text';

const units: Unit[] = [
  { id: 'u1', sourceId: 'a', page: 3, type: 'study', text: 'Unsichtbarer Gorilla: 58 % bemerkten ihn bei einfacher, 27 % bei schwerer Aufgabe.', study: { authors: 'Simons & Chabris', year: 1999 } },
  { id: 'u2', sourceId: 'a', page: 4, type: 'study', text: 'Türsteher-Experiment: 7 von 15 bemerkten den Personenwechsel.', study: { authors: 'Simons & Levin', year: 1998 } },
  { id: 'u3', sourceId: 'b', page: 1, type: 'concept', text: 'Attenuationstheorie nach Treisman (1964): unbeachtete Reize werden abgeschwächt.' },
];

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  sources: [{ docId: 'a', name: 'A', pageCount: 10 }, { docId: 'b', name: 'B', pageCount: 5 }],
  units, omittedSources: [], sourceWords: 2000, ...over,
});

const p = (id: string, text: string, cites = [{ sourceId: 'a', page: 3 }], origin: 'quelle' | 'ki' = 'quelle'): Block =>
  ({ id, origin, cites, type: 'paragraph', text });

describe('Text-Hilfen', () => {
  it('normalisiert Prozent, Jahre und "x von y"', () => {
    expect(extractFacts('58 % und 27% sowie 46 Prozent, 7 von 15, im Jahr 1964')).toEqual(['58%', '27%', '46%', '7/15', '1964']);
  });
  it('erkennt abgeschnittene Wörter, aber nicht ganze Sätze mit Auslassung', () => {
    expect(looksTruncated('die Helligk…')).toBe(true);
    expect(looksTruncated('fehlinterp...')).toBe(true);
    expect(looksTruncated('Das ist vollständig.')).toBe(false);
    expect(looksTruncated('Reihe 1, 2, 3 …')).toBe(false);
  });
  it('findet Autor-Jahr-Angaben', () => {
    expect(authorYears('Treisman (1964) und Li et al., 2011 sowie Deutsch & Deutsch (1963)'))
      .toEqual([{ author: 'Treisman', year: 1964 }, { author: 'Li', year: 2011 }, { author: 'Deutsch', year: 1963 }]);
  });
  it('zählt Wörter ohne Fettdruck', () => {
    expect(countWords('**Filtertheorie**: alles oder nichts.')).toBe(4);
  });
});

describe('1. Zitate gültig', () => {
  it('meldet fremde Quellen und Seiten außerhalb', () => {
    const issues = checkCites([p('b1', 'x', [{ sourceId: 'zz', page: 1 }]), p('b2', 'y', [{ sourceId: 'b', page: 9 }]), p('b3', 'z')], ctx());
    expect(issues.map(i => i.blockId)).toEqual(['b1', 'b2']);
  });
  it('Quellen ohne Seiten brauchen page 0', () => {
    const c = ctx({ sources: [{ docId: 't', name: 'T', pageCount: 0 }] });
    expect(checkCites([p('b1', 'x', [{ sourceId: 't', page: 0 }])], c)).toEqual([]);
    expect(checkCites([p('b2', 'x', [{ sourceId: 't', page: 2 }])], c)).toHaveLength(1);
  });
});

describe('2. Abdeckung', () => {
  it('jede Quelle zitiert oder begründet ausgelassen', () => {
    expect(checkCoverage([p('b1', 'x')], ctx()).map(i => i.sourceId)).toEqual(['b']);
    expect(checkCoverage([p('b1', 'x')], ctx({ omittedSources: [{ sourceId: 'b', reason: 'doppelt' }] }))).toEqual([]);
  });
});

describe('3. Länge', () => {
  it('meldet zu lang und zu kurz gegenüber 25 bis 40 %', () => {
    const long = [p('b1', 'wort '.repeat(1000))];
    expect(checkLength(long, ctx())[0].message).toMatch(/Zu lang/);
    const short = [p('b1', 'wort '.repeat(100))];
    expect(checkLength(short, ctx())[0].message).toMatch(/Zu kurz/);
    expect(checkLength([p('b1', 'wort '.repeat(650))], ctx())).toEqual([]);
  });
});

describe('4. Zahlen', () => {
  it('Zahlen müssen auf den zitierten Seiten stehen', () => {
    expect(checkNumbers([p('b1', 'Gorilla: 58 % bzw. 27 % bemerkten ihn.')], ctx())).toEqual([]);
    expect(checkNumbers([p('b1', 'Gorilla: 50 % bemerkten ihn.')], ctx())).toHaveLength(1);
    // richtige Zahl, aber falsche Seite zitiert
    expect(checkNumbers([p('b1', '7 von 15 bemerkten den Wechsel.')], ctx())).toHaveLength(1);
    expect(checkNumbers([p('b1', '7 von 15 bemerkten den Wechsel.', [{ sourceId: 'a', page: 4 }])], ctx())).toEqual([]);
  });
});

describe('5. Autor und Jahr', () => {
  it('falsches Jahr, verschiedene Jahre, unsortierte Zeitleiste', () => {
    expect(checkAuthorYears([p('b1', 'Treisman (1964) schlug vor …')], ctx())).toEqual([]);
    expect(checkAuthorYears([p('b1', 'Treisman (1960) schlug vor')], ctx())).not.toEqual([]);
    const tl: Block = { id: 't', origin: 'quelle', cites: [], type: 'timeline', items: [
      { year: 1999, who: 'Simons', what: 'x', cites: [] }, { year: 1964, who: 'Treisman', what: 'y', cites: [] }] };
    expect(checkAuthorYears([tl], ctx()).some(i => /sortiert/.test(i.message))).toBe(true);
  });
});

describe('6. Abgeschnittener Text', () => {
  it('meldet Bildtexte, die mitten im Wort enden', () => {
    const fig: Block = { id: 'f', origin: 'quelle', cites: [], type: 'figure', sourceId: 'a', page: 3, imageRef: 'A1', caption: 'Der Reiz wird fehlinterp…' };
    expect(checkTruncated([fig])).toHaveLength(1);
  });
});

describe('7. Zitatdichte', () => {
  it('keine Quellenangaben als Text', () => {
    expect(checkCiteDensity([p('b1', 'Das gilt [1, S. 94].')])).toHaveLength(1);
    expect(checkCiteDensity([p('b1', 'Das gilt (S. 12).')])).toHaveLength(1);
    expect(checkCiteDensity([p('b1', 'Das gilt.')])).toEqual([]);
  });
});

describe('8. KI-Blöcke', () => {
  it('keine neuen Jahreszahlen, Prozentwerte oder Quellen', () => {
    expect(checkKiFacts([p('k', 'Stell dir eine Party vor.', [], 'ki')], ctx())).toEqual([]);
    expect(checkKiFacts([p('k', 'Etwa 90 % aller Menschen kennen das.', [], 'ki')], ctx())).toHaveLength(1);
    expect(checkKiFacts([p('k', 'Wie schon Broadbent (1958) zeigte.', [], 'ki')], ctx()).length).toBeGreaterThan(0);
  });
});
