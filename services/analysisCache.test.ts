import { describe, it, expect, beforeEach } from 'vitest';
import { buildCacheKey, buildTopicSnapshot, loadCachedAnalysis, saveCachedAnalysis, clearCachedAnalysis } from './analysisCache';
import type { TopicMetric, LearningAnalysis } from '../types';

const metric = (topic: string, confidence: number): TopicMetric =>
  ({ id: topic, topic, confidence, lastReviewed: 0, totalAttempts: 1, correctAttempts: 1 });

const dummyAnalysis: LearningAnalysis = { errorPatterns: [], overallHealth: 'ok' };

describe('buildCacheKey', () => {
  it('liefert für identische Eingaben denselben Schlüssel', async () => {
    const fp = { errorIds: ['a', 'b'], topicSnapshot: 'x:50', filterScope: 'global' };
    const k1 = await buildCacheKey(fp);
    const k2 = await buildCacheKey({ errorIds: ['b', 'a'], topicSnapshot: 'x:50', filterScope: 'global' });
    expect(k1).toBe(k2); // Reihenfolge der IDs darf keine Rolle spielen (wird sortiert)
  });

  it('unterscheidet Datenstände, die bei einer reinen Summe kollidieren würden', async () => {
    // Das Beispiel aus dem Review: 5 Quiz + 3 Feynman vs. 4 Quiz + 4 Feynman = Summe 8 in beiden Fällen
    const a = await buildCacheKey({ errorIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'f1', 'f2', 'f3'], topicSnapshot: '', filterScope: 'global' });
    const b = await buildCacheKey({ errorIds: ['q1', 'q2', 'q3', 'q4', 'f1', 'f2', 'f3', 'f4'], topicSnapshot: '', filterScope: 'global' });
    expect(a).not.toBe(b);
  });

  it('unterscheidet unterschiedliche Themen-Konfidenz-Snapshots bei sonst gleichen Fehlern', async () => {
    const a = await buildCacheKey({ errorIds: ['q1'], topicSnapshot: 'Halo:40', filterScope: 'global' });
    const b = await buildCacheKey({ errorIds: ['q1'], topicSnapshot: 'Halo:90', filterScope: 'global' });
    expect(a).not.toBe(b);
  });

  it('unterscheidet unterschiedliche Filter-Bereiche bei sonst identischen Daten', async () => {
    const a = await buildCacheKey({ errorIds: ['q1'], topicSnapshot: '', filterScope: 'global' });
    const b = await buildCacheKey({ errorIds: ['q1'], topicSnapshot: '', filterScope: 'Statistik-Skript' });
    expect(a).not.toBe(b);
  });

  it('liefert einen Hex-String fester Länge (SHA-256 = 64 Zeichen)', async () => {
    const key = await buildCacheKey({ errorIds: [], topicSnapshot: '', filterScope: 'global' });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildTopicSnapshot', () => {
  it('ist unabhängig von der Eingabe-Reihenfolge', () => {
    const a = buildTopicSnapshot([metric('B', 50), metric('A', 70)]);
    const b = buildTopicSnapshot([metric('A', 70), metric('B', 50)]);
    expect(a).toBe(b);
  });

  it('ändert sich, wenn sich ein Konfidenzwert ändert', () => {
    const a = buildTopicSnapshot([metric('A', 70)]);
    const b = buildTopicSnapshot([metric('A', 71)]);
    expect(a).not.toBe(b);
  });
});

describe('load/save/clearCachedAnalysis', () => {
  beforeEach(() => localStorage.clear());

  it('lädt nur bei exakt passendem Schlüssel', () => {
    saveCachedAnalysis('key-a', dummyAnalysis);
    expect(loadCachedAnalysis('key-a')).toEqual(dummyAnalysis);
    expect(loadCachedAnalysis('key-b')).toBeNull();
  });

  it('ohne Cache-Eintrag: null', () => {
    expect(loadCachedAnalysis('irrelevant')).toBeNull();
  });

  it('clearCachedAnalysis entfernt den Eintrag vollständig', () => {
    saveCachedAnalysis('key-a', dummyAnalysis);
    clearCachedAnalysis();
    expect(loadCachedAnalysis('key-a')).toBeNull();
  });
});
