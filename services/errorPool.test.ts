import { describe, it, expect } from 'vitest';
import { buildErrorPool } from './errorPool';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';

const HOUR = 3_600_000;
const now = Date.now();

const mkQuiz = (id: string, docName: string, ts: number, wrongTopics: string[]): QuizResult => ({
  id, docId: 'd', docName, timestamp: ts, score: 0, correctCount: 0, totalCount: wrongTopics.length,
  weakTopics: wrongTopics,
  questions: wrongTopics.map(topic => ({ question: `Frage zu ${topic}`, options: [], correctAnswerIndices: [], isMultipleChoice: false, explanation: `Erklärung ${topic}`, distractorExplanations: [], sourceReference: '', topic } as any)),
  answers: wrongTopics.map((_, i) => ({ questionIndex: i, selectedOptionIndices: [], isCorrect: false })),
});

const mkExam = (id: string, docName: string, ts: number, questions: { topic: string; points: number; achieved: number }[]): ExamResult => ({
  id, docName, timestamp: ts, score: 0, passed: false, totalPoints: 0, achievedPoints: 0, weakTopics: [],
  questions: questions.map((q, i) => ({
    id: `eq${i}`, type: 'open', question: `Klausurfrage ${q.topic}`, solution: `Lösung ${q.topic}`,
    points: q.points, achievedPoints: q.achieved, topic: q.topic, feedback: `Feedback ${q.topic}`,
  } as any)),
});

const mkRecall = (id: string, docName: string, ts: number, topic: string, missing: string[]): RecallResult => ({
  id, docName, timestamp: ts, score: 0, topic, missingPoints: missing,
});

describe('buildErrorPool', () => {
  it('leere Historie ergibt leeren Pool', () => {
    expect(buildErrorPool({ quiz: [], exam: [], recall: [] })).toEqual([]);
  });

  it('vergibt jedem Fehler eine stabile, eindeutige id und sessionId-Herkunft', () => {
    const pool = buildErrorPool({
      quiz: [mkQuiz('q1', 'Doc', now, ['Halo-Effekt'])],
      exam: [], recall: [],
    });
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('q1:q0');
    expect(pool[0].topic).toBe('Halo-Effekt');
  });

  it('Quotierung: eine seit Wochen ungenutzte Quelle verhungert nicht neben viel frischerer Aktivität', () => {
    // 10 ganz frische Quiz-Fehler heute, aber nur 1 Feynman-Lücke vor 3 Wochen —
    // reiner Recency-Sort würde die Feynman-Lücke komplett verdrängen.
    const quiz = Array.from({ length: 4 }, (_, i) =>
      mkQuiz(`quiz${i}`, 'Doc', now - i * HOUR, ['A', 'B', 'C'])); // 4 Sessions x 3 = 12 mögliche Quiz-Fehler
    const recall = [mkRecall('old-feynman', 'Doc', now - 21 * 24 * HOUR, 'Altes Thema', ['Die einzige, aber alte Lücke.'])];
    const pool = buildErrorPool({ quiz, exam: [], recall, limit: 10 });
    expect(pool.some(e => e.id === 'old-feynman:m0')).toBe(true);
  });

  it('Klausur-Fragen werden nach Schweregrad (relativer Punktverlust) sortiert, nicht nach Reihenfolge', () => {
    const exam = mkExam('e1', 'Doc', now, [
      { topic: 'Kleinfehler', points: 50, achieved: 49 },   // 2% Verlust, steht zuerst im Dokument
      { topic: 'Totalausfall', points: 10, achieved: 0 },   // 100% Verlust, steht als zweites
      { topic: 'Mittel', points: 20, achieved: 10 },        // 50% Verlust
    ]);
    const pool = buildErrorPool({ quiz: [], exam: [exam], recall: [], limit: 3 });
    expect(pool.map(e => e.topic)).toEqual(['Totalausfall', 'Mittel', 'Kleinfehler']);
  });

  it('Klausur-Fragen ohne Punktverlust fließen nicht ein', () => {
    const exam = mkExam('e1', 'Doc', now, [{ topic: 'Voll erreicht', points: 10, achieved: 10 }]);
    expect(buildErrorPool({ quiz: [], exam: [exam], recall: [] })).toEqual([]);
  });

  it('Dokument-Filter schließt Fehler aus anderen Dokumenten aus', () => {
    const quiz = [mkQuiz('q1', 'Statistik', now, ['A']), mkQuiz('q2', 'Psychologie', now, ['B'])];
    const pool = buildErrorPool({ quiz, exam: [], recall: [], docFilter: 'Statistik' });
    expect(pool).toHaveLength(1);
    expect(pool[0].docName).toBe('Statistik');
  });

  it('Dokument-Filter ohne Treffer ergibt leeren Pool', () => {
    const quiz = [mkQuiz('q1', 'Statistik', now, ['A'])];
    expect(buildErrorPool({ quiz, exam: [], recall: [], docFilter: 'Nicht vorhanden' })).toEqual([]);
  });

  it('respektiert das Gesamtlimit', () => {
    const quiz = Array.from({ length: 8 }, (_, i) => mkQuiz(`q${i}`, 'Doc', now - i * HOUR, ['A', 'B', 'C']));
    const pool = buildErrorPool({ quiz, exam: [], recall: [], limit: 20 });
    expect(pool.length).toBeLessThanOrEqual(20);
  });

  it('Ergebnis ist nach Aktualität sortiert', () => {
    const quiz = [mkQuiz('q1', 'Doc', now - 2 * HOUR, ['A']), mkQuiz('q2', 'Doc', now, ['B'])];
    const pool = buildErrorPool({ quiz, exam: [], recall: [] });
    expect(pool[0].topic).toBe('B');
  });
});
