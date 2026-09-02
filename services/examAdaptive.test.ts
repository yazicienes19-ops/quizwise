import { describe, it, expect } from 'vitest';
import { computeTopicWeights, computeDifficultyMix } from './examAdaptive';
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

  it('Mindestkontingent überschreitet nie die Hälfte der Gesamtfragenzahl', () => {
    const weak = Array.from({ length: 5 }, (_, i) => topic(`T${i}`, 'kritisch', 10));
    const weights = computeTopicWeights(weak, 10);
    const total = weights.reduce((s, w) => s + w.minCount, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('begrenzt auf maxTopics (Default 5)', () => {
    const weak = Array.from({ length: 8 }, (_, i) => topic(`T${i}`, 'unsicher', 40));
    expect(computeTopicWeights(weak, 20).length).toBe(5);
  });
});

describe('computeDifficultyMix', () => {
  it('neutrale Werte (mittlerer Notenschnitt, Termin innerhalb 21 Tagen): exakt der Basis-Mix der gewählten Stufe', () => {
    expect(computeDifficultyMix('mittel', 65, 10)).toEqual({ leicht: 25, mittel: 50, schwer: 25 });
  });

  it('kein Klausurtermin bekannt: etwas leichter/diagnostischer als mit nahem Termin', () => {
    const keinTermin = computeDifficultyMix('mittel', null, null);
    const naherTermin = computeDifficultyMix('mittel', null, 5);
    expect(keinTermin.leicht).toBeGreaterThan(naherTermin.leicht);
  });

  it('Summe ist immer exakt 100', () => {
    const cases: [number | null, number | null][] = [[null, null], [90, 3], [30, 40], [55, 25]];
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
});
