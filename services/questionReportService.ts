import type { QuizQuestion } from '../types';
import { supabase } from './supabaseClient';
import { voidQuestionInHistory } from './quizHistoryService';
import { removeMistakesByQuestionText } from './mistakeReviewService';

/**
 * questionReportService — "Frage melden" mit echter Wirkung.
 *
 * Vorher (Befund 12.09.2026): Meldungen landeten nur im localStorage, niemand
 * las sie je aus, und die Quiz-Meldungen teilten sich den Schlüssel mit dem
 * Klausur-Feedback (examFeedbackService), dessen Liste dabei auf 100 Einträge
 * gekappt wurde. Jetzt:
 * - eigener lokaler Schlüssel (Altbestand wird einmalig herausgelöst),
 * - Meldung geht an Supabase (Tabelle question_reports) und erscheint im
 *   Admin-Dashboard,
 * - "Antwort falsch" / "keine richtige Option" annulliert die Frage: sie
 *   verschwindet aus Verlauf und Wertung und aus der Fehlerwiederholung,
 * - gemeldete Fragen stehen als Ausschlussliste im Quiz-Prompt.
 */

export type QuestionReportReason = 'unclear' | 'wrong' | 'duplicate' | 'too_easy' | 'too_hard' | 'no_correct' | 'other';

/** Gründe, bei denen die Frage selbst kaputt ist: sie darf nicht gegen den Nutzer zählen. */
export const isVoidingReason = (reason: QuestionReportReason): boolean => reason === 'wrong' || reason === 'no_correct';

export interface LocalQuestionReport {
  id: string;
  questionText: string;
  reason: QuestionReportReason;
  docName?: string;
  timestamp: number;
}

const REPORTS_KEY = 'studearc_quiz_reports_v1';
const LEGACY_KEY = 'studearc_question_feedback';
const MAX_REPORTS = 200;

const read = (): LocalQuestionReport[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};

const write = (reports: LocalQuestionReport[]): void => {
  try { localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(-MAX_REPORTS))); } catch { /* voll */ }
};

/** Löst alte Quiz-Meldungen aus dem gemeinsamen Schlüssel; Klausur-Feedback bleibt dort. */
export const migrateLegacyQuizReports = (): void => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (!Array.isArray(raw)) return;
    const isQuizEntry = (e: any) => !!e && typeof e.questionText === 'string' && typeof e.reason === 'string';
    const quiz = raw.filter(isQuizEntry) as LocalQuestionReport[];
    if (quiz.length === 0) return;
    write([...read(), ...quiz]);
    localStorage.setItem(LEGACY_KEY, JSON.stringify(raw.filter(e => !isQuizEntry(e))));
  } catch { /* ignore */ }
};

export const getQuizReports = (): LocalQuestionReport[] => {
  migrateLegacyQuizReports();
  return read();
};

/** Zuletzt gemeldete Fragen (neueste zuerst, ohne Duplikate) für den Quiz-Prompt. */
export const getReportedQuestionTexts = (limit = 15): string[] =>
  [...new Set(getQuizReports().slice().reverse().map(r => r.questionText))].slice(0, limit);

const currentUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
};

/** Schreibt eine Meldung in question_reports (RLS: nur eigene Zeilen). Fehlt die
 *  Tabelle noch (Migration nicht ausgeführt), bleibt es still bei der lokalen Meldung. */
export const sendReportToCloud = async (row: {
  kind: 'quiz' | 'exam';
  reason: string;
  questionText: string;
  details?: Record<string, unknown>;
  docName?: string;
}): Promise<void> => {
  if (!(await currentUserId())) return;
  try {
    const { error } = await supabase.from('question_reports').insert({
      kind: row.kind,
      reason: row.reason.slice(0, 40),
      question_text: row.questionText.slice(0, 2000),
      details: row.details ?? {},
      doc_name: row.docName ? row.docName.slice(0, 300) : null,
    });
    if (error) console.warn('[questionReport] Cloud-Meldung nicht gespeichert:', error.message);
  } catch { /* offline */ }
};

export const reportQuizQuestion = async (
  question: QuizQuestion,
  reason: QuestionReportReason,
  docName?: string,
): Promise<{ voided: boolean }> => {
  const text = (question?.question ?? '').trim();
  if (!text) return { voided: false };

  const reports = getQuizReports();
  const stored = text.slice(0, 500);
  const duplicate = reports.some(r => r.questionText === stored && r.reason === reason);
  if (!duplicate) {
    write([...reports, { id: Math.random().toString(36).slice(2, 9), questionText: stored, reason, docName, timestamp: Date.now() }]);
  }

  const voided = isVoidingReason(reason);
  const userId = await currentUserId();
  if (voided) {
    voidQuestionInHistory(text, userId);
    removeMistakesByQuestionText(text, userId);
  }
  if (!duplicate) {
    // Abgewartet (sendReportToCloud wirft nie): der Aufrufer (ResultView)
    // wartet ohnehin nicht, und so ist die Meldung sicher raus, bevor die
    // Funktion zurückkehrt.
    await sendReportToCloud({
      kind: 'quiz',
      reason,
      questionText: text,
      docName,
      details: {
        options: question.options,
        correctAnswerIndices: question.correctAnswerIndices,
        explanation: question.explanation,
        topic: question.topic,
      },
    }).catch(() => {});
  }
  return { voided };
};
