import { describe, it, expect } from 'vitest';
import { buildLearningProfile, germanGradeFromPercentage } from './learningProfileService';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { TopicMetric, FlashcardDeck } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

const emptyInput = {
  metrics: [] as TopicMetric[],
  quizResults: [] as QuizResult[],
  recallResults: [] as RecallResult[],
  examResults: [] as ExamResult[],
  decks: [] as FlashcardDeck[],
  streak: { current: 0, best: 0 },
};

describe('germanGradeFromPercentage', () => {
  it('mappt Grenzwerte auf die deutsche Notenskala', () => {
    expect(germanGradeFromPercentage(95).grade).toBe('1.0');
    expect(germanGradeFromPercentage(50).grade).toBe('4.0');
    expect(germanGradeFromPercentage(49).grade).toBe('5.0');
    expect(germanGradeFromPercentage(49).label).toBe('Nicht Bestanden');
  });
});

describe('buildLearningProfile — Methodenvergleich', () => {
  it('liefert leere perMethod-Liste ohne Daten', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.perMethod).toEqual([]);
    expect(profile.examPrognosis).toBeNull();
  });

  it('trennt Feynman (recall) und KI-Erklärer (explainer) anhand des method-Felds', () => {
    const recallResults: RecallResult[] = [
      { id: '1', docName: 'A', timestamp: now, score: 80, topic: 'X', missingPoints: [], method: 'recall' },
      { id: '2', docName: 'A', timestamp: now, score: 60, topic: 'X', missingPoints: [], method: 'explainer' },
      // Altdaten ohne method-Feld → müssen als 'recall' gelten
      { id: '3', docName: 'A', timestamp: now, score: 70, topic: 'X', missingPoints: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, recallResults });
    const feynman = profile.perMethod.find(m => m.method === 'feynman');
    const explainer = profile.perMethod.find(m => m.method === 'explainer');
    expect(feynman?.sessions).toBe(2);
    expect(feynman?.avgScore).toBe(75); // (80+70)/2
    expect(explainer?.sessions).toBe(1);
    expect(explainer?.avgScore).toBe(60);
  });
});

describe('buildLearningProfile — Themen-Sicherheit', () => {
  it('stuft niedrige Konfidenz + häufige Schwachstellen als kritisch ein', () => {
    const metrics: TopicMetric[] = [
      { id: 'm1', topic: 'Dualismus', confidence: 30, lastReviewed: now, totalAttempts: 3, correctAttempts: 1 },
      { id: 'm2', topic: 'Empirismus', confidence: 90, lastReviewed: now, totalAttempts: 3, correctAttempts: 3 },
    ];
    const quizResults: QuizResult[] = [
      { id: 'q1', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
      { id: 'q2', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
      { id: 'q3', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, metrics, quizResults });
    const dualismus = profile.topicMastery.find(t => t.topic === 'Dualismus');
    const empirismus = profile.topicMastery.find(t => t.topic === 'Empirismus');
    expect(dualismus?.security).toBe('kritisch');
    expect(empirismus?.security).toBe('sicher');
  });
});

describe('buildLearningProfile — Vergessensanalyse', () => {
  it('erkennt Decks mit demnächst fälligen, bereits gelernten Karten', () => {
    const decks: FlashcardDeck[] = [{
      id: 'd1', title: 'Kapitel 6',
      cards: [
        { id: 'c1', front: 'F', back: 'B', level: 1, nextReview: now + 2 * DAY_MS, srs: { ease: 2.5, interval: 6, repetitions: 2, nextReview: now + 2 * DAY_MS, lastReview: now } },
        { id: 'c2', front: 'F2', back: 'B2', level: 0, nextReview: now, srs: { ease: 2.5, interval: 0, repetitions: 0, nextReview: now, lastReview: null } }, // noch nie gelernt → zählt nicht
      ],
    }];
    const profile = buildLearningProfile({ ...emptyInput, decks });
    expect(profile.forgetting).toHaveLength(1);
    expect(profile.forgetting[0]).toMatchObject({ topic: 'Kapitel 6', dueInDays: 2, cardCount: 1 });
  });

  it('ignoriert Decks ohne bald fällige Karten', () => {
    const decks: FlashcardDeck[] = [{
      id: 'd1', title: 'Kapitel 1',
      cards: [{ id: 'c1', front: 'F', back: 'B', level: 3, nextReview: now + 30 * DAY_MS, srs: { ease: 2.8, interval: 30, repetitions: 5, nextReview: now + 30 * DAY_MS, lastReview: now } }],
    }];
    const profile = buildLearningProfile({ ...emptyInput, decks });
    expect(profile.forgetting).toEqual([]);
  });
});

describe('buildLearningProfile — Klausurprognose', () => {
  it('gewichtet neuere Klausuren stärker und berechnet eine Note', () => {
    const examResults: ExamResult[] = [
      // Speicherreihenfolge: neueste zuerst (siehe examHistoryService.saveExamResult)
      { id: 'e1', docName: 'Klausur 3', timestamp: now, score: 90, passed: true, totalPoints: 100, achievedPoints: 90, weakTopics: [] },
      { id: 'e2', docName: 'Klausur 2', timestamp: now - DAY_MS, score: 50, passed: true, totalPoints: 100, achievedPoints: 50, weakTopics: [] },
      { id: 'e3', docName: 'Klausur 1', timestamp: now - 2 * DAY_MS, score: 40, passed: false, totalPoints: 100, achievedPoints: 40, weakTopics: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.examPrognosis).not.toBeNull();
    expect(profile.examPrognosis!.basis).toBe(3);
    // gewichteter Score liegt näher an 90 (neueste, höchstes Gewicht) als am ungewichteten Mittel 60
    expect(profile.examPrognosis!.grade).not.toBe('5.0');
  });

  it('liefert null ohne Klausur-Historie', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.examPrognosis).toBeNull();
  });
});
