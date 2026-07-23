import { describe, it, expect } from 'vitest';
import { computeTopicCalibrationGaps, MIN_CALIBRATED_FOR_GAP } from './calibrationGap';
import type { QuizResult } from './quizHistoryService';

const mkResult = (topic: string, entries: { confidence: 'sicher' | 'unsicher'; isCorrect: boolean }[]): QuizResult => ({
  id: Math.random().toString(36).slice(2, 9),
  docId: 'd1', docName: 'Doc', timestamp: Date.now(), score: 50, correctCount: 0, totalCount: entries.length,
  weakTopics: [],
  questions: entries.map(() => ({ question: 'Q', options: [], correctAnswerIndices: [], isMultipleChoice: false, explanation: '', distractorExplanations: [], sourceReference: '', topic } as any)),
  answers: entries.map((e, i) => ({ questionIndex: i, selectedOptionIndices: [], isCorrect: e.isCorrect, confidence: e.confidence })),
});

describe('computeTopicCalibrationGaps', () => {
  it('ignoriert Themen unter der Mindestschwelle', () => {
    const entries = Array.from({ length: MIN_CALIBRATED_FOR_GAP - 1 }, () => ({ confidence: 'sicher' as const, isCorrect: false }));
    expect(computeTopicCalibrationGaps([mkResult('Halo-Effekt', entries)])).toEqual([]);
  });

  it('berechnet Überschätzung korrekt ab Erreichen der Schwelle', () => {
    // 5x "sicher", davon 3x falsch -> 60% Überschätzung
    const entries = [
      { confidence: 'sicher' as const, isCorrect: false },
      { confidence: 'sicher' as const, isCorrect: false },
      { confidence: 'sicher' as const, isCorrect: false },
      { confidence: 'sicher' as const, isCorrect: true },
      { confidence: 'sicher' as const, isCorrect: true },
    ];
    const gaps = computeTopicCalibrationGaps([mkResult('Halo-Effekt', entries)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ topic: 'Halo-Effekt', overconfidenceRate: 60, underconfidenceRate: 0, n: 5 });
  });

  it('berechnet Unterschätzung korrekt', () => {
    const entries = [
      { confidence: 'unsicher' as const, isCorrect: true },
      { confidence: 'unsicher' as const, isCorrect: true },
      { confidence: 'unsicher' as const, isCorrect: false },
      { confidence: 'unsicher' as const, isCorrect: false },
      { confidence: 'unsicher' as const, isCorrect: false },
    ];
    const gaps = computeTopicCalibrationGaps([mkResult('Kognitive Dissonanz', entries)]);
    expect(gaps[0]).toMatchObject({ underconfidenceRate: 40, overconfidenceRate: 0 });
  });

  it('ignoriert Antworten ohne gesetzte Selbsteinschätzung und ohne Thema', () => {
    const r = mkResult('X', []);
    r.answers = [{ questionIndex: 0, selectedOptionIndices: [], isCorrect: true }];
    r.questions = [{ question: 'Q', options: [], correctAnswerIndices: [], isMultipleChoice: false, explanation: '', distractorExplanations: [], sourceReference: '' } as any];
    expect(computeTopicCalibrationGaps([r])).toEqual([]);
  });

  it('summiert über mehrere Sessions zum selben Thema', () => {
    const mk3sicherFalsch = mkResult('Halo-Effekt', [
      { confidence: 'sicher', isCorrect: false }, { confidence: 'sicher', isCorrect: false }, { confidence: 'sicher', isCorrect: false },
    ]);
    const mk2sicherRichtig = mkResult('Halo-Effekt', [
      { confidence: 'sicher', isCorrect: true }, { confidence: 'sicher', isCorrect: true },
    ]);
    const gaps = computeTopicCalibrationGaps([mk3sicherFalsch, mk2sicherRichtig]);
    expect(gaps[0]).toMatchObject({ n: 5, overconfidenceRate: 60 });
  });

  it('leere Historie ergibt leere Liste', () => {
    expect(computeTopicCalibrationGaps([])).toEqual([]);
  });
});
