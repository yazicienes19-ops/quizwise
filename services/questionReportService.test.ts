import { describe, it, expect, beforeEach, vi } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }) },
    from: vi.fn(() => ({ insert })),
  },
}));

import { reportQuizQuestion, getQuizReports, getReportedQuestionTexts, migrateLegacyQuizReports } from './questionReportService';
import { saveQuizResult, getAllResults } from './quizHistoryService';
import { addMistakes, getMistakeQueue } from './mistakeReviewService';
import type { QuizQuestion } from '../types';

const q = (text: string, topic = 'T'): QuizQuestion => ({
  question: text, options: ['a', 'b'], correctAnswerIndices: [0], explanation: 'weil', topic,
} as unknown as QuizQuestion);

describe('questionReportService', () => {
  beforeEach(() => { localStorage.clear(); insert.mockClear(); });

  it('löst alte Quiz-Meldungen aus dem gemeinsamen Schlüssel, Klausur-Feedback bleibt dort', () => {
    localStorage.setItem('studearc_question_feedback', JSON.stringify([
      { id: 'x', questionText: 'Alte Quizfrage?', reason: 'unclear', timestamp: 1 },
      { questionHash: 'klausur', type: 'too_strict', timestamp: 2 },
    ]));
    migrateLegacyQuizReports();
    expect(getQuizReports().map(r => r.questionText)).toEqual(['Alte Quizfrage?']);
    expect(JSON.parse(localStorage.getItem('studearc_question_feedback')!)).toEqual([{ questionHash: 'klausur', type: 'too_strict', timestamp: 2 }]);
  });

  it('"Antwort falsch" annulliert die Frage: raus aus Verlauf, Wertung neu, raus aus der Fehlerwiederholung', async () => {
    const questions = [q('Kaputte Frage?'), q('Gute Frage?')];
    saveQuizResult({
      docId: 'd1', docName: 'Skript', timestamp: 1, score: 0, correctCount: 0, totalCount: 2, weakTopics: ['T'],
      questions, answers: [{ questionIndex: 0, isCorrect: false } as any, { questionIndex: 1, isCorrect: true } as any],
    });
    addMistakes([questions[0]], { docId: 'd1', docName: 'Skript' });
    expect(getMistakeQueue()).toHaveLength(1);

    const { voided } = await reportQuizQuestion(questions[0], 'wrong', 'Skript');

    expect(voided).toBe(true);
    const [result] = getAllResults();
    expect(result.questions.map(x => x.question)).toEqual(['Gute Frage?']);
    expect(result.answers).toEqual([{ questionIndex: 0, isCorrect: true }]);
    expect(result.score).toBe(100);
    expect(result.totalCount).toBe(1);
    expect(getMistakeQueue()).toHaveLength(0);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: 'quiz', reason: 'wrong', question_text: 'Kaputte Frage?', doc_name: 'Skript' });
  });

  it('"Zu leicht" wird gemeldet, lässt Wertung und Wiederholung aber unangetastet', async () => {
    saveQuizResult({
      docId: 'd1', docName: 'Skript', timestamp: 1, score: 0, correctCount: 0, totalCount: 1, weakTopics: [],
      questions: [q('Leichte Frage?')], answers: [{ questionIndex: 0, isCorrect: false } as any],
    });
    const { voided } = await reportQuizQuestion(q('Leichte Frage?'), 'too_easy');
    expect(voided).toBe(false);
    expect(getAllResults()[0].totalCount).toBe(1);
    expect(getReportedQuestionTexts()).toEqual(['Leichte Frage?']);
  });

  it('meldet dieselbe Frage mit demselben Grund nur einmal an die Cloud', async () => {
    await reportQuizQuestion(q('Doppelt?'), 'unclear');
    await reportQuizQuestion(q('Doppelt?'), 'unclear');
    expect(getQuizReports()).toHaveLength(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('eine Session, deren einzige Frage annulliert wird, verschwindet aus dem Verlauf', async () => {
    saveQuizResult({
      docId: 'd1', docName: 'Skript', timestamp: 1, score: 0, correctCount: 0, totalCount: 1, weakTopics: [],
      questions: [q('Einzige Frage?')], answers: [{ questionIndex: 0, isCorrect: false } as any],
    });
    await reportQuizQuestion(q('Einzige Frage?'), 'no_correct');
    expect(getAllResults()).toHaveLength(0);
  });
});
