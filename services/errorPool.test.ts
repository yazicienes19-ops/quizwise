import { describe, it, expect } from 'vitest';
import { buildErrorPool } from './errorPool';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { ReaderLogEntry } from './readerLogService';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const mkTutorEntry = (id: string, docId: string, docName: string, ts: number, concept: string, wasEscalated: boolean): ReaderLogEntry => ({
  id, docId, docName, chapterIndex: 0, chapterTitle: `Thema ${concept}`, concept,
  timestamp: ts, answer: `Antwort zu ${concept}`, wasEscalated,
});

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

  describe('wiederkehrende Themen (Kontingent A)', () => {
    it('ein Thema aus >=2 Sessions überlebt trotz alten letzten Fehlers, verdrängt durch reine Recency', () => {
      // "Wiederkehrend" tauchte vor 10 und 8 Tagen auf (2 Sessions) - alt, aber wiederholt.
      // 20 ganz frische Einzel-Fehler zu anderen, jeweils einmaligen Themen würden bei reiner
      // Quotierung/Recency die alte Dauerschwäche komplett aus den 10 Plätzen verdrängen.
      const oldRecurring = [
        mkQuiz('old1', 'Doc', now - 10 * 24 * HOUR, ['Wiederkehrend']),
        mkQuiz('old2', 'Doc', now - 8 * 24 * HOUR, ['Wiederkehrend']),
      ];
      const freshUnique = Array.from({ length: 6 }, (_, i) =>
        mkQuiz(`fresh${i}`, 'Doc', now - i * HOUR, [`Einmalig${i}`]));
      const pool = buildErrorPool({ quiz: [...oldRecurring, ...freshUnique], exam: [], recall: [], limit: 10 });
      const recurringEntry = pool.find(e => e.topic === 'Wiederkehrend');
      expect(recurringEntry).toBeDefined();
      expect(recurringEntry?.isRecurringTopic).toBe(true);
    });

    it('ein Thema, das nur innerhalb einer einzigen Session mehrfach auftaucht, gilt NICHT als wiederkehrend', () => {
      const quiz = [mkQuiz('q1', 'Doc', now, ['Einmalsession', 'Einmalsession'])];
      const pool = buildErrorPool({ quiz, exam: [], recall: [], limit: 10 });
      expect(pool.every(e => !e.isRecurringTopic)).toBe(true);
    });

    it('Themen ohne Angabe können nie als wiederkehrend markiert werden', () => {
      const quiz = [
        mkQuiz('q1', 'Doc', now - 10 * 24 * HOUR, ['']),
        mkQuiz('q2', 'Doc', now - 8 * 24 * HOUR, ['']),
      ];
      const pool = buildErrorPool({ quiz, exam: [], recall: [], limit: 10 });
      expect(pool.every(e => !e.isRecurringTopic)).toBe(true);
    });

    it('keine doppelte Zählung: ein als wiederkehrend gewähltes Item taucht nicht zusätzlich im Recency-Kontingent auf', () => {
      const oldRecurring = [
        mkQuiz('old1', 'Doc', now - 10 * 24 * HOUR, ['Wiederkehrend']),
        mkQuiz('old2', 'Doc', now - 8 * 24 * HOUR, ['Wiederkehrend']),
      ];
      const freshUnique = Array.from({ length: 6 }, (_, i) =>
        mkQuiz(`fresh${i}`, 'Doc', now - i * HOUR, [`Einmalig${i}`]));
      const pool = buildErrorPool({ quiz: [...oldRecurring, ...freshUnique], exam: [], recall: [], limit: 10 });
      const ids = pool.map(e => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('Gesamtlimit wird trotz zweier Kontingente weiterhin respektiert', () => {
      const oldRecurring = [
        mkQuiz('old1', 'Doc', now - 10 * 24 * HOUR, ['Wiederkehrend']),
        mkQuiz('old2', 'Doc', now - 8 * 24 * HOUR, ['Wiederkehrend']),
      ];
      const freshUnique = Array.from({ length: 10 }, (_, i) =>
        mkQuiz(`fresh${i}`, 'Doc', now - i * HOUR, [`Einmalig${i}`]));
      const pool = buildErrorPool({ quiz: [...oldRecurring, ...freshUnique], exam: [], recall: [], limit: 10 });
      expect(pool.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Tutor-Fragen als viertes Fehlersignal (Punkt 11)', () => {
    it('eskalierte Tutor-Fragen fließen in den Pool ein', () => {
      const tutorLog = [mkTutorEntry('t1', 'd1', 'Doc', now, 'Signifikanztest', true)];
      const pool = buildErrorPool({ quiz: [], exam: [], recall: [], tutorLog, limit: 10 });
      expect(pool.some(e => e.id === 't1')).toBe(true);
      expect(pool.find(e => e.id === 't1')?.topic).toBe('Thema Signifikanztest');
    });

    it('nicht eskalierte (reine Neugier-)Fragen zählen NICHT als Fehler', () => {
      const tutorLog = [mkTutorEntry('t1', 'd1', 'Doc', now, 'Neugierfrage', false)];
      const pool = buildErrorPool({ quiz: [], exam: [], recall: [], tutorLog, limit: 10 });
      expect(pool.some(e => e.id === 't1')).toBe(false);
    });

    it('mehrere eskalierte Fragen am selben Lesetag zählen als EINE Sitzung (Pseudo-Session Dokument+Tag)', () => {
      const tutorLog = [
        mkTutorEntry('t1', 'd1', 'Doc', now, 'Thema A', true),
        mkTutorEntry('t2', 'd1', 'Doc', now - HOUR, 'Thema A', true),
      ];
      const pool = buildErrorPool({ quiz: [], exam: [], recall: [], tutorLog, limit: 20 });
      // Beide Fragen kommen rein (Kontingent reicht), aber sie gelten NICHT als
      // wiederkehrend (nur 1 Sitzung) — kein isRecurringTopic-Flag.
      expect(pool.filter(e => e.topic === 'Thema A').every(e => !e.isRecurringTopic)).toBe(true);
    });

    it('dieselbe Frage an unterschiedlichen Lesetagen zählt als 2 Sitzungen -> wiederkehrend möglich', () => {
      const tutorLog = [
        mkTutorEntry('t1', 'd1', 'Doc', now, 'Signifikanztest', true),
        mkTutorEntry('t2', 'd1', 'Doc', now - 10 * DAY, 'Signifikanztest', true),
      ];
      const freshUnique = Array.from({ length: 6 }, (_, i) =>
        mkQuiz(`fresh${i}`, 'Doc', now - i * HOUR, [`Einmalig${i}`]));
      const pool = buildErrorPool({ quiz: freshUnique, exam: [], recall: [], tutorLog, limit: 10 });
      const recurring = pool.find(e => e.topic === 'Thema Signifikanztest');
      expect(recurring?.isRecurringTopic).toBe(true);
    });

    it('respektiert den Dokument-Filter wie die anderen drei Quellen', () => {
      const tutorLog = [
        mkTutorEntry('t1', 'd1', 'Statistik', now, 'Thema A', true),
        mkTutorEntry('t2', 'd2', 'Psychologie', now, 'Thema B', true),
      ];
      const pool = buildErrorPool({ quiz: [], exam: [], recall: [], tutorLog, docFilter: 'Statistik', limit: 10 });
      expect(pool.map(e => e.id)).toEqual(['t1']);
    });

    it('ohne tutorLog-Parameter (bestehende Aufrufer) bleibt der Pool unverändert nutzbar', () => {
      const pool = buildErrorPool({ quiz: [mkQuiz('q1', 'Doc', now, ['A'])], exam: [], recall: [] });
      expect(pool).toHaveLength(1);
    });
  });
});
