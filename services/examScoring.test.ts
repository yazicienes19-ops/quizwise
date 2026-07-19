import { describe, it, expect } from 'vitest';
import { scoreMc } from './examScoring';

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
