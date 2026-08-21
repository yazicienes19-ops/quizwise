import { describe, it, expect } from 'vitest';
import { mergeById, mergeReadingProgress, mergeMetrics } from './syncService';
import type { TopicMetric } from '../types';

describe('mergeById (Cloud-Pull ohne Datenverlust)', () => {
  it('leere Cloud lässt lokal unberührt, leeres Local übernimmt Cloud', () => {
    const local = [{ id: 'a', timestamp: 10 }];
    expect(mergeById(local, [])).toEqual(local);
    const cloud = [{ id: 'b', timestamp: 5 }];
    expect(mergeById([], cloud)).toEqual(cloud);
    expect(mergeById(undefined, cloud)).toEqual(cloud);
  });

  it('vereinigt disjunkte ids beider Seiten', () => {
    const merged = mergeById(
      [{ id: 'a', timestamp: 10 }, { id: 'b', timestamp: 20 }],
      [{ id: 'c', timestamp: 5 }, { id: 'd', timestamp: 1 }],
      'timestamp',
    );
    expect(merged.map(m => m.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Konflikt: neuerer Zeitstempel gewinnt (offline gelerntes lokal bleibt erhalten)', () => {
    const merged = mergeById(
      [{ id: 'a', timestamp: 100 }, { id: 'b', timestamp: 50 }],
      [{ id: 'a', timestamp: 10 }, { id: 'b', timestamp: 90 }],
      'timestamp',
    );
    const a = merged.find(m => m.id === 'a')!;
    const b = merged.find(m => m.id === 'b')!;
    expect(a.timestamp).toBe(100); // lokal neuer → lokal
    expect(b.timestamp).toBe(90);  // Cloud neuer → Cloud
  });

  it('ohne tsKey gewinnt lokal bei Konflikten (aktivere Quelle)', () => {
    const merged = mergeById(
      [{ id: 'a', subject: 'lokal' }],
      [{ id: 'a', subject: 'cloud' }, { id: 'c', subject: 'cloud-neu' }],
    );
    expect(merged.find(m => m.id === 'a')!.subject).toBe('lokal');
    expect(merged.find(m => m.id === 'c')).toBeDefined();
  });

  it('mit tsKey: Ergebnis absteigend sortiert (neueste zuerst, wie die History-Services)', () => {
    const merged = mergeById(
      [{ id: 'a', timestamp: 10 }],
      [{ id: 'b', timestamp: 30 }],
      'timestamp',
    );
    expect(merged.map(m => m.id)).toEqual(['b', 'a']);
  });

  it('alternative Zeitstempel-Felder (addedAt für mistake_queue, savedAt für gespeicherte Quizze)', () => {
    const merged = mergeById(
      [{ id: 'a', addedAt: 100 }],
      [{ id: 'a', addedAt: 200 }],
      'addedAt',
    );
    expect(merged[0].addedAt).toBe(200);
  });
});

describe('mergeReadingProgress', () => {
  it('done=true gewinnt unabhängig vom Zeitstempel', () => {
    const merged = mergeReadingProgress(
      { doc1: { '0': { done: true, doneAt: 5 } } },
      { doc1: { '0': { done: false, doneAt: 99 } } },
    );
    expect(merged.doc1['0'].done).toBe(true);
    // Cloud-done schlägt lokales nicht-done
    const merged2 = mergeReadingProgress(
      { doc1: { '0': { done: false, doneAt: 99 } } },
      { doc1: { '0': { done: true, doneAt: 5 } } },
    );
    expect(merged2.doc1['0'].done).toBe(true);
  });

  it('beide done: neueres doneAt gewinnt; Kapitel-Union bleibt vollständig', () => {
    const merged = mergeReadingProgress(
      { doc1: { '0': { done: true, doneAt: 10 }, '1': { done: true, doneAt: 50 } } },
      { doc1: { '0': { done: true, doneAt: 40 }, '2': { done: true, doneAt: 1 } } },
    );
    expect(merged.doc1['0'].doneAt).toBe(40);
    expect(merged.doc1['1'].doneAt).toBe(50);
    expect(merged.doc1['2']).toBeDefined();
  });

  it('Dokumente ohne Cloud-Pendant bleiben unangetastet', () => {
    const merged = mergeReadingProgress({ nurLokal: { '0': { done: true, doneAt: 1 } } }, {});
    expect(merged.nurLokal).toBeDefined();
  });
});

describe('mergeMetrics', () => {
  const mk = (topic: string, lastReviewed: number, confidence: number): TopicMetric =>
    ({ id: topic, topic, confidence, lastReviewed, totalAttempts: 1, correctAttempts: 1 });

  it('neueres lastReviewed gewinnt pro Thema', () => {
    const merged = mergeMetrics(
      [mk('A', 100, 30), mk('B', 100, 80)],
      [mk('A', 200, 90), mk('C', 50, 60)],
    );
    expect(merged.find(m => m.topic === 'A')!.confidence).toBe(90);
    expect(merged.find(m => m.topic === 'B')!.confidence).toBe(80);
    expect(merged.find(m => m.topic === 'C')).toBeDefined();
  });

  it('leere Eingaben führen nicht zu Datenverlust', () => {
    const local = [mk('A', 1, 50)];
    expect(mergeMetrics(local, [])).toEqual(local);
    expect(mergeMetrics([], local)).toEqual(local);
  });
});
