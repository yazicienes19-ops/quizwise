import { describe, it, expect } from 'vitest';
import { updateSubScore, aggregateConfidence, updateTopicMetric } from './topicConfidence';
import type { TopicMetric } from '../types';

describe('updateSubScore (adaptives α = 1/(n+1))', () => {
  it('erste Beobachtung: Wert wird exakt zum Score (α=1)', () => {
    expect(updateSubScore(undefined, 80)).toEqual({ value: 80, n: 1 });
  });

  it('zweite Beobachtung: echter arithmetischer Mittelwert (α=1/2)', () => {
    const s1 = updateSubScore(undefined, 80);
    const s2 = updateSubScore(s1, 40);
    expect(s2).toEqual({ value: 60, n: 2 }); // (80+40)/2
  });

  it('dritte Beobachtung: α=1/3, kein fixer 0,5-Sprung mehr', () => {
    let s = updateSubScore(undefined, 90);
    s = updateSubScore(s, 90);
    s = updateSubScore(s, 0); // ein einzelner Ausreißer
    // (90+90+0)/3 = 60 — bei fixem α=0.5 wäre es (90 -> 90 -> 45) gewesen
    expect(s.value).toBe(60);
    expect(s.n).toBe(3);
  });

  it('konvergiert bei vielen Updates gegen einen stabilen, aber weiterhin reagiblen Wert', () => {
    let s: { value: number; n: number } | undefined;
    for (let i = 0; i < 20; i++) s = updateSubScore(s, 100);
    expect(s!.value).toBe(100);
    const afterDrop = updateSubScore(s, 0);
    expect(afterDrop.value).toBeLessThan(100);
    expect(afterDrop.value).toBeGreaterThan(0); // reagiert, reißt aber nicht komplett runter
  });
});

describe('aggregateConfidence', () => {
  it('ohne Sub-Scores: 0', () => {
    expect(aggregateConfidence(undefined)).toBe(0);
  });

  it('eine Quelle: entspricht deren Wert', () => {
    expect(aggregateConfidence({ quiz: { value: 70, n: 3 } })).toBe(70);
  });

  it('mehrere Quellen: gewichtet nach n', () => {
    // quiz: 90 bei n=9, recall (Feynman): 30 bei n=1 -> (90*9 + 30*1)/10 = 84
    expect(aggregateConfidence({ quiz: { value: 90, n: 9 }, recall: { value: 30, n: 1 } })).toBe(84);
  });

  it('ignoriert Quellen mit n=0', () => {
    expect(aggregateConfidence({ quiz: { value: 50, n: 0 }, exam: { value: 80, n: 2 } })).toBe(80);
  });
});

describe('updateTopicMetric', () => {
  it('legt ein neues Thema mit korrektem Sub-Score an', () => {
    const m = updateTopicMetric(undefined, 'Halo-Effekt', 80, 'quiz');
    expect(m.topic).toBe('Halo-Effekt');
    expect(m.confidence).toBe(80);
    expect(m.subScores?.quiz).toEqual({ value: 80, n: 1 });
    expect(m.totalAttempts).toBe(1);
  });

  it('getrennte Sub-Scores: Feynman-Lücke zieht nicht am Klausur-Wert', () => {
    let m = updateTopicMetric(undefined, 'Kognitive Dissonanz', 90, 'exam');
    m = updateTopicMetric(m, 'Kognitive Dissonanz', 20, 'recall');
    expect(m.subScores?.exam).toEqual({ value: 90, n: 1 });
    expect(m.subScores?.recall).toEqual({ value: 20, n: 1 });
  });

  it('Migration: Alt-Datensatz ohne subScores bekommt n=5-Startpunkt statt Hart-Sprung', () => {
    const legacy: TopicMetric = { id: 'x', topic: 'Altes Thema', confidence: 75, lastReviewed: 0, totalAttempts: 12, correctAttempts: 9 };
    const m = updateTopicMetric(legacy, 'Altes Thema', 20, 'quiz');
    // alpha = 1/6 bei n=5 vorher -> 75 + 1/6*(20-75) ≈ 65.8 -> gerundet 66, NICHT (75+20)/2=47.5 (alpha=0.5-Sprung)
    expect(m.subScores?.quiz?.n).toBe(6);
    expect(m.confidence).toBeGreaterThan(60);
    expect(m.confidence).toBeLessThan(75);
  });

  it('totalAttempts/correctAttempts bleiben für Rückwärtskompatibilität erhalten', () => {
    let m = updateTopicMetric(undefined, 'X', 100, 'quiz');
    m = updateTopicMetric(m, 'X', 40, 'quiz');
    expect(m.totalAttempts).toBe(2);
    expect(m.correctAttempts).toBe(1); // nur der erste Score war >= 70
  });
});
