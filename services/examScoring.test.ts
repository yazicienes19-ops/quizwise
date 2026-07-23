import { describe, it, expect } from 'vitest';
import { scoreMc, matchBlank, scoreFillblank, scoreRanking } from './examScoring';

describe('scoreMc', () => {
  it('exakt richtige Auswahl: volle Punkte', () => {
    expect(scoreMc([1, 3], [1, 3]).fraction).toBe(1);
  });

  it('Exploit abgestellt: alle Optionen ankreuzen bei 1 richtigen ergibt 0', () => {
    const s = scoreMc([0, 1, 2, 3], [1]);
    expect(s.fraction).toBe(0);
    expect(s.hits).toBe(1);
    expect(s.wrong).toBe(3);
  });

  it('alle ankreuzen bei 2 von 4 richtigen ergibt 0 (2 Treffer − 2 falsche)', () => {
    expect(scoreMc([0, 1, 2, 3], [0, 2]).fraction).toBe(0);
  });

  it('Teilwissen wird belohnt: 1 von 2 richtigen, nichts Falsches = 50%', () => {
    expect(scoreMc([1], [1, 3]).fraction).toBe(0.5);
  });

  it('richtige plus eine falsche: Abzug statt pauschal halbe Punkte', () => {
    // 3 richtige erkannt, 1 falsche → (3−1)/3
    expect(scoreMc([0, 1, 2, 3], [0, 1, 2]).fraction).toBeCloseTo(2 / 3);
  });

  it('nur Falsches gewählt: 0, nie negativ', () => {
    const s = scoreMc([0, 2], [1]);
    expect(s.fraction).toBe(0);
  });

  it('Duplikate in der Nutzerauswahl zählen nicht doppelt', () => {
    expect(scoreMc([1, 1, 3], [1, 3]).fraction).toBe(1);
  });

  it('leere richtige Liste: 0 (defensiv)', () => {
    expect(scoreMc([0], []).fraction).toBe(0);
  });
});

describe('matchBlank', () => {
  it('exakte Übereinstimmung (auch bei Groß-/Kleinschreibung)', () => {
    expect(matchBlank('Konditionierung', 'konditionierung')).toBe('exact');
    expect(matchBlank('  Reiz  ', 'Reiz')).toBe('exact');
  });

  it('kurze Wörter (<=4 Zeichen) erlauben KEINE Toleranz', () => {
    expect(matchBlank('Reit', 'Reiz')).toBe('none'); // 1 Fehler bei 4 Zeichen -> nicht erlaubt
    expect(matchBlank('Reiz', 'Reiz')).toBe('exact');
  });

  it('mittlere Wörter (5-8 Zeichen) erlauben genau 1 Fehler', () => {
    expect(matchBlank('Reflx', 'Reflex')).toBe('tolerant'); // 1 Fehler (fehlendes e), 6 Zeichen
    expect(matchBlank('Reflax', 'Reflex')).toBe('tolerant'); // 1 Ersetzung
    expect(matchBlank('Rfx', 'Reflex')).toBe('none'); // 3 Fehler, zu viele
  });

  it('lange Wörter (>8 Zeichen) erlauben bis zu 2 Fehler', () => {
    expect(matchBlank('Konditionirung', 'Konditionierung')).toBe('tolerant'); // 1 Fehler
    expect(matchBlank('Kondiionirung', 'Konditionierung')).toBe('tolerant'); // 2 Fehler
    expect(matchBlank('Konditioning', 'Konditionierung')).toBe('none'); // >2 Fehler
  });

  it('leere Nutzerantwort zählt nie, auch nicht bei kurzem korrektem Wort', () => {
    expect(matchBlank('', 'Reiz')).toBe('none');
    expect(matchBlank('   ', 'Reiz')).toBe('none');
  });

  it('komplett falsches Wort bleibt "none", unabhängig von der Länge', () => {
    expect(matchBlank('Apfel', 'Konditionierung')).toBe('none');
  });
});

describe('scoreFillblank', () => {
  it('alle Lücken exakt richtig: volle Punktzahl-Anteil 1', () => {
    const s = scoreFillblank(['Reiz', 'Reaktion'], ['Reiz', 'Reaktion']);
    expect(s.fraction).toBe(1);
    expect(s.results).toEqual(['exact', 'exact']);
  });

  it('ein Tippfehler in einer längeren Lücke zählt als Treffer (tolerant)', () => {
    const s = scoreFillblank(['Konditionirung'], ['Konditionierung']);
    expect(s.fraction).toBe(1);
    expect(s.results).toEqual(['tolerant']);
  });

  it('gemischt: ein exakter, ein falscher, ein tolerierter Treffer', () => {
    const s = scoreFillblank(['Reiz', 'Apfel', 'Reflx'], ['Reiz', 'Reaktion', 'Reflex']);
    expect(s.hits).toBe(2);
    expect(s.fraction).toBeCloseTo(2 / 3);
    expect(s.results).toEqual(['exact', 'none', 'tolerant']);
  });

  it('leere Lückenliste: 0 (defensiv)', () => {
    expect(scoreFillblank([], []).fraction).toBe(0);
  });
});

describe('scoreRanking', () => {
  it('exakt richtige Reihenfolge: volle Konkordanz', () => {
    const s = scoreRanking(['A', 'B', 'C'], ['A', 'B', 'C']);
    expect(s.fraction).toBe(1);
    expect(s.concordantPairs).toBe(s.totalPairs);
  });

  it('komplett umgekehrte Reihenfolge: 0 Konkordanz', () => {
    const s = scoreRanking(['C', 'B', 'A'], ['A', 'B', 'C']);
    expect(s.fraction).toBe(0);
  });

  it('ein benachbartes Paar vertauscht: Teilpunkte statt 0', () => {
    // Korrekt: A,B,C,D. Nutzer: A,C,B,D — nur das Paar (B,C) ist diskordant,
    // die anderen 5 von 6 möglichen Paaren stimmen weiterhin.
    const s = scoreRanking(['A', 'C', 'B', 'D'], ['A', 'B', 'C', 'D']);
    expect(s.totalPairs).toBe(6);
    expect(s.concordantPairs).toBe(5);
    expect(s.fraction).toBeCloseTo(5 / 6);
  });

  it('fehlende Elemente in der Nutzerreihenfolge zählen als diskordant, kein Crash', () => {
    const s = scoreRanking(['A'], ['A', 'B', 'C']);
    expect(s.totalPairs).toBe(3);
    expect(s.concordantPairs).toBe(0);
  });

  it('nur 1 Element: 0 mögliche Paare, fraction 0 statt NaN', () => {
    const s = scoreRanking(['A'], ['A']);
    expect(s.totalPairs).toBe(0);
    expect(s.fraction).toBe(0);
  });
});
