import { describe, it, expect } from 'vitest';
import { buildExamAnalysis } from './examAnalysisService';
import type { ExamQuestion } from '../types';

const q = (over: Partial<ExamQuestion>): ExamQuestion =>
  ({
    id: Math.random().toString(36).slice(2, 7),
    question: 'F',
    type: 'mc',
    solution: 'L',
    points: 4,
    achievedPoints: 2,
    ...over,
  } as ExamQuestion);

describe('buildExamAnalysis (deterministisch, ohne KI)', () => {
  it('topicPerformance: Punkte je Thema, schlechteste zuerst', () => {
    const a = buildExamAnalysis([
      q({ topic: 'A', points: 10, achievedPoints: 9 }),
      q({ topic: 'B', points: 10, achievedPoints: 2 }),
    ]);
    expect(a.topicPerformance).toHaveLength(2);
    expect(a.topicPerformance[0].topic).toBe('B');
    expect(a.topicPerformance[0].score).toBe(20);
    expect(a.topicPerformance[1].score).toBe(90);
  });

  it('Fragen ohne Thema oder ohne Punkte zählen nicht', () => {
    const a = buildExamAnalysis([q({ topic: undefined }), q({ topic: 'X', points: 0 })]);
    expect(a.topicPerformance).toHaveLength(0);
  });

  it('Stärken ab 75% mit mind. 3 Punkten, Schwächen unter 50%', () => {
    const a = buildExamAnalysis([
      q({ topic: 'Stark', points: 10, achievedPoints: 9 }),   // 90% → Stärke
      q({ topic: 'KleinStark', points: 2, achievedPoints: 2 }), // 100% aber nur 2 P. → keine Stärke
      q({ topic: 'Schwach', points: 10, achievedPoints: 3 }), // 30% → Schwäche
      q({ topic: 'Mittel', points: 10, achievedPoints: 6 }),  // 60% → weder noch
    ]);
    expect(a.strengths.some(s => s.includes('Stark') && !s.includes('Klein'))).toBe(true);
    expect(a.strengths.some(s => s.includes('KleinStark'))).toBe(false);
    expect(a.weaknesses.some(s => s.includes('Schwach'))).toBe(true);
    expect(a.weaknesses.some(s => s.includes('Mittel'))).toBe(false);
  });

  it('Empfehlung: schwächstes Thema unter 60% wird genannt', () => {
    const a = buildExamAnalysis([q({ topic: 'Statistik', points: 10, achievedPoints: 4 })]);
    expect(a.recommendations.some(r => r.includes('Statistik'))).toBe(true);
  });

  it('Fatigue-Abfall >15 Punkte erzeugt Pausen-Empfehlung', () => {
    const withFatigue = buildExamAnalysis(
      [q({ topic: 'A', points: 10, achievedPoints: 9 })],
      { earlyScore: 80, lateScore: 50 },
    );
    expect(withFatigue.recommendations.some(r => r.includes('80') && r.includes('50'))).toBe(true);
    const withoutFatigue = buildExamAnalysis(
      [q({ topic: 'A', points: 10, achievedPoints: 9 })],
      { earlyScore: 80, lateScore: 75 },
    );
    expect(withoutFatigue.recommendations.some(r => r.includes('80') && r.includes('50'))).toBe(false);
  });

  it('alles solide → positive Fallback-Empfehlung statt erfundener Schwächen', () => {
    const a = buildExamAnalysis([q({ topic: 'A', points: 10, achievedPoints: 9 })]);
    expect(a.recommendations).toHaveLength(1);
    expect(a.weaknesses).toHaveLength(0);
  });
});
