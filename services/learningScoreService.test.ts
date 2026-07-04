import { describe, it, expect } from 'vitest';
import { buildLearningScore } from './learningScoreService';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { TopicMetric, FlashcardDeck, Flashcard } from '../types';

const now = Date.now();

const emptyInput = {
  quizResults: [] as QuizResult[],
  examResults: [] as ExamResult[],
  recallResults: [] as RecallResult[],
  metrics: [] as TopicMetric[],
  decks: [] as FlashcardDeck[],
  streakCurrent: 0,
};

const mkRecall = (score: number): RecallResult =>
  ({ id: Math.random().toString(36), docName: 'D', timestamp: now, score, topic: 'T', missingPoints: [] });

const mkQuiz = (score: number): QuizResult =>
  ({ id: Math.random().toString(36), docId: 'd', docName: 'D', timestamp: now, score, correctCount: 1, totalCount: 2, weakTopics: [], questions: [], answers: [] });

const mkExam = (score: number, categoryBreakdown?: { category: string; score: number }[]): ExamResult =>
  ({ id: Math.random().toString(36), docName: 'D', timestamp: now, score, passed: score >= 50, totalPoints: 10, achievedPoints: score / 10, weakTopics: [], categoryBreakdown }) as unknown as ExamResult;

const mkCard = (interval: number, repetitions: number): Flashcard => ({
  id: Math.random().toString(36), front: 'F', back: 'B', level: repetitions, nextReview: now,
  srs: { ease: 2.5, interval, repetitions, nextReview: now, lastReview: now },
});

describe('buildLearningScore', () => {
  it('alle Dimensionen null ohne Daten, overall null', () => {
    const score = buildLearningScore(emptyInput);
    expect(score.dimensions.every(d => d.score === null)).toBe(true);
    expect(score.overall).toBeNull();
    expect(score.dimensions).toHaveLength(5);
  });

  it('Verständnis: null unter 2 Sessions, sonst Ø der Recall-Scores', () => {
    expect(buildLearningScore({ ...emptyInput, recallResults: [mkRecall(80)] }).dimensions[0].score).toBeNull();
    const score = buildLearningScore({ ...emptyInput, recallResults: [mkRecall(80), mkRecall(60)] });
    expect(score.dimensions[0].score).toBe(70);
  });

  it('Wissen behalten: null unter 10 etablierten Karten; Anteil stabiler Intervalle + Streak-Bonus, Cap 100', () => {
    const fewCards: FlashcardDeck[] = [{ id: 'd', title: 'T', cards: Array.from({ length: 5 }, () => mkCard(10, 2)) }];
    expect(buildLearningScore({ ...emptyInput, decks: fewCards }).dimensions[1].score).toBeNull();

    // 10 etablierte Karten, alle interval >= 7 → 100% + Bonus, Cap 100
    const stable: FlashcardDeck[] = [{ id: 'd', title: 'T', cards: Array.from({ length: 10 }, () => mkCard(10, 2)) }];
    expect(buildLearningScore({ ...emptyInput, decks: stable, streakCurrent: 30 }).dimensions[1].score).toBe(100);

    // Hälfte stabil, Streak 4 → 50 + 4
    const mixed: FlashcardDeck[] = [{
      id: 'd', title: 'T',
      cards: [...Array.from({ length: 5 }, () => mkCard(10, 2)), ...Array.from({ length: 5 }, () => mkCard(2, 1))],
    }];
    expect(buildLearningScore({ ...emptyInput, decks: mixed, streakCurrent: 4 }).dimensions[1].score).toBe(54);
  });

  it('Karten ohne srs oder ohne Wiederholungen zählen nicht als etabliert', () => {
    const cards: Flashcard[] = [
      ...Array.from({ length: 9 }, () => mkCard(10, 2)),
      { id: 'x', front: 'F', back: 'B', level: 0, nextReview: now }, // kein srs
    ];
    const score = buildLearningScore({ ...emptyInput, decks: [{ id: 'd', title: 'T', cards }] });
    expect(score.dimensions[1].score).toBeNull(); // nur 9 etabliert
  });

  it('Wissen abrufen: Quiz-Ø und Anki-Ø werden gemittelt; einer reicht', () => {
    const quizOnly = buildLearningScore({ ...emptyInput, quizResults: [mkQuiz(80), mkQuiz(60)] });
    expect(quizOnly.dimensions[2].score).toBe(70);

    const metrics: TopicMetric[] = Array.from({ length: 3 }, (_, i) =>
      ({ id: `m${i}`, topic: `T${i}`, confidence: 50, lastReviewed: now, totalAttempts: 1, correctAttempts: 1 }));
    const both = buildLearningScore({ ...emptyInput, quizResults: [mkQuiz(80), mkQuiz(60)], metrics });
    expect(both.dimensions[2].score).toBe(60); // (70 + 50) / 2
  });

  it('Wissen anwenden: nur transfer/beispiel-Kategorien zählen', () => {
    const exam = mkExam(70, [
      { category: 'transfer', score: 40 },
      { category: 'beispiel', score: 60 },
      { category: 'definition', score: 95 },
    ]);
    const score = buildLearningScore({ ...emptyInput, examResults: [exam] });
    expect(score.dimensions[3].score).toBe(50);
  });

  it('Klausurleistung: null unter 2 Klausuren, sonst Ø', () => {
    expect(buildLearningScore({ ...emptyInput, examResults: [mkExam(80)] }).dimensions[4].score).toBeNull();
    const score = buildLearningScore({ ...emptyInput, examResults: [mkExam(80), mkExam(60)] });
    expect(score.dimensions[4].score).toBe(70);
  });

  it('overall = Ø der berechenbaren Dimensionen', () => {
    const score = buildLearningScore({
      ...emptyInput,
      recallResults: [mkRecall(80), mkRecall(80)],   // Verständnis 80
      examResults: [mkExam(60), mkExam(60)],          // Klausur 60, Transfer null (kein Breakdown)
    });
    expect(score.overall).toBe(70);
  });
});
