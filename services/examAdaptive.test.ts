import { describe, it, expect } from 'vitest';
import {
  computeTopicWeights, computeDifficultyMix, recentAverageScore,
  excludeTopicsWithoutAdaptive, computeActualDifficultyMix, computeTopicCoverage,
} from './examAdaptive';
import type { TopicSecurity } from '../types';

const topic = (topic: string, security: TopicSecurity['security'], confidence: number): TopicSecurity => ({
  topic, security, confidence, weakCount: 0,
});

describe('computeTopicWeights', () => {
  it('ohne Historie: leeres Ergebnis', () => {
    expect(computeTopicWeights([], 10)).toEqual([]);
  });

  it('nur sichere Themen: leeres Ergebnis (kein Mindestkontingent nötig)', () => {
    expect(computeTopicWeights([topic('A', 'sicher', 90)], 10)).toEqual([]);
  });

  it('kritisches Thema bekommt mehr Mindestfragen als ein unsicheres bei gleicher Gesamtzahl', () => {
    const weights = computeTopicWeights([topic('Kritisch', 'kritisch', 20), topic('Unsicher', 'unsicher', 55)], 10);
    const kritisch = weights.find(w => w.topic === 'Kritisch')!;
    const unsicher = weights.find(w => w.topic === 'Unsicher')!;
    expect(kritisch.minCount).toBeGreaterThan(unsicher.minCount);
  });

  it('Mindestkontingent überschreitet nie die Hälfte der Gesamtfragenzahl, auch bei vielen schwachen Themen', () => {
    for (const total of [5, 10, 15, 20]) {
      const weak = Array.from({ length: 8 }, (_, i) => topic(`T${i}`, 'kritisch', 10));
      const weights = computeTopicWeights(weak, total);
      const sum = weights.reduce((s, w) => s + w.minCount, 0);
      expect(sum).toBeLessThanOrEqual(Math.floor(total / 2));
      expect(weights.every(w => w.minCount >= 1)).toBe(true);
    }
  });

  it('bei 5 Fragen und 5 schwachen Themen bleiben nur 2 Themen mit je 1 Frage übrig', () => {
    const weak = Array.from({ length: 5 }, (_, i) => topic(`T${i}`, 'kritisch', 10));
    expect(computeTopicWeights(weak, 5)).toEqual([{ topic: 'T0', minCount: 1 }, { topic: 'T1', minCount: 1 }]);
  });

  it('begrenzt auf maxTopics (Default 5)', () => {
    const weak = Array.from({ length: 8 }, (_, i) => topic(`T${i}`, 'unsicher', 40));
    expect(computeTopicWeights(weak, 20).length).toBe(5);
  });
});

describe('computeDifficultyMix', () => {
  it('neutrale Werte (65 % Notenschnitt, Termin innerhalb 21 Tagen): exakt der Basis-Mix der gewählten Stufe', () => {
    expect(computeDifficultyMix('mittel', 65, 10)).toEqual({ leicht: 25, mittel: 50, schwer: 25 });
  });

  it('kein Klausurtermin bekannt: etwas leichter/diagnostischer als mit nahem Termin', () => {
    const keinTermin = computeDifficultyMix('mittel', null, null);
    const naherTermin = computeDifficultyMix('mittel', null, 5);
    expect(keinTermin.leicht).toBeGreaterThan(naherTermin.leicht);
  });

  it('Summe ist immer exakt 100', () => {
    const cases: [number | null, number | null][] = [[null, null], [90, 3], [30, 40], [55, 25], [79, 21], [80, 22]];
    for (const [score, days] of cases) {
      const mix = computeDifficultyMix('mittel', score, days);
      expect(mix.leicht + mix.mittel + mix.schwer).toBe(100);
    }
  });

  it('hoher jüngerer Notenschnitt verschiebt den Mix schwerer (weniger leicht, mehr schwer)', () => {
    const base = computeDifficultyMix('mittel', null, null);
    const hoch = computeDifficultyMix('mittel', 90, null);
    expect(hoch.schwer).toBeGreaterThan(base.schwer);
    expect(hoch.leicht).toBeLessThan(base.leicht);
  });

  it('niedriger jüngerer Notenschnitt verschiebt den Mix leichter', () => {
    const base = computeDifficultyMix('mittel', null, null);
    const niedrig = computeDifficultyMix('mittel', 30, null);
    expect(niedrig.leicht).toBeGreaterThan(base.leicht);
    expect(niedrig.schwer).toBeLessThan(base.schwer);
  });

  it('weit entfernter/kein Klausurtermin macht den Mix diagnostischer/leichter als ein naher Termin', () => {
    const nah = computeDifficultyMix('mittel', null, 5);
    const weit = computeDifficultyMix('mittel', null, 60);
    const kein = computeDifficultyMix('mittel', null, null);
    expect(weit.leicht).toBeGreaterThan(nah.leicht);
    expect(kein.leicht).toBeGreaterThan(nah.leicht);
  });

  it('stetige Kurve: 79 % und 80 % Notenschnitt liegen höchstens 1 Prozentpunkt auseinander', () => {
    const a = computeDifficultyMix('mittel', 79, 10);
    const b = computeDifficultyMix('mittel', 80, 10);
    expect(Math.abs(a.schwer - b.schwer)).toBeLessThanOrEqual(1);
    const c = computeDifficultyMix('mittel', 65, 21);
    const d = computeDifficultyMix('mittel', 65, 22);
    expect(Math.abs(c.leicht - d.leicht)).toBeLessThanOrEqual(1);
  });

  it('Verschiebung ist monoton im Notenschnitt', () => {
    let prev = computeDifficultyMix('mittel', 0, 10).schwer;
    for (let score = 5; score <= 100; score += 5) {
      const cur = computeDifficultyMix('mittel', score, 10).schwer;
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('Sättigung: über 80 % bzw. unter 50 % keine weitere Verschiebung', () => {
    expect(computeDifficultyMix('mittel', 80, 10)).toEqual(computeDifficultyMix('mittel', 100, 10));
    expect(computeDifficultyMix('mittel', 50, 10)).toEqual(computeDifficultyMix('mittel', 0, 10));
  });
});

describe('recentAverageScore', () => {
  it('null ohne Historie, sonst Schnitt der ersten n Werte', () => {
    expect(recentAverageScore([])).toBeNull();
    expect(recentAverageScore([80, 90, 100, 0, 0, 0], 3)).toBe(90);
  });
});

describe('excludeTopicsWithoutAdaptive', () => {
  it('entfernt Themen aus der Ausschlussliste, die als Mindestkontingent verlangt werden', () => {
    const result = excludeTopicsWithoutAdaptive(['Bayes-Theorem', 'Regression', 'Varianz'], [{ topic: 'bayes-theorem ', minCount: 2 }]);
    expect(result).toEqual(['Regression', 'Varianz']);
  });

  it('ohne Kontingent bleibt die Liste unverändert', () => {
    const list = ['A', 'B'];
    expect(excludeTopicsWithoutAdaptive(list, [])).toBe(list);
  });
});

describe('computeActualDifficultyMix', () => {
  it('zählt nur gültige Stufen und summiert auf 100', () => {
    const mix = computeActualDifficultyMix([
      { difficulty: 'leicht' }, { difficulty: 'schwer' }, { difficulty: 'schwer' }, { difficulty: 'unbekannt' }, {},
    ]);
    expect(mix).toEqual({ leicht: 33, mittel: 0, schwer: 67 });
  });

  it('ohne Daten alles 0', () => {
    expect(computeActualDifficultyMix([{}])).toEqual({ leicht: 0, mittel: 0, schwer: 0 });
  });
});

describe('computeTopicCoverage', () => {
  it('zählt Fragen je Soll-Thema, tolerant gegenüber Schreibweise und Teilstrings', () => {
    const questions = [
      { topic: 'Bayes-Theorem' }, { topic: 'bayes-theorem' }, { topic: 'Satz von Bayes-Theorem' }, { topic: 'Regression' }, { topic: '' },
    ];
    const coverage = computeTopicCoverage(questions, [{ topic: 'Bayes-Theorem', minCount: 3 }, { topic: 'Varianz', minCount: 1 }]);
    expect(coverage).toEqual([
      { topic: 'Bayes-Theorem', minCount: 3, actual: 3 },
      { topic: 'Varianz', minCount: 1, actual: 0 },
    ]);
  });
});
