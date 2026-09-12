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
 * - jede Meldung wird mit Sendestatus gespeichert und an Supabase
 *   (question_reports) hochgeladen; was nicht rausging (offline, alte
 *   Meldungen von vor dem Upload), holt uploadPendingQuizReports beim
 *   nächsten App-Start nach,
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
  /** Antwortoptionen, richtige Antwort, Erklärung: fürs Admin-Dashboard. */
  details?: Record<string, unknown>;
  /** Zeitpunkt des erfolgreichen Uploads; fehlt = noch nicht in der Cloud. */
  sentAt?: number;
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

/** Schreibt eine einzelne Meldung in question_reports (RLS: nur eigene Zeilen).
 *  Genutzt vom Klausur-Feedback; Quiz-Meldungen laufen über uploadPendingQuizReports. */
export const sendReportToCloud = async (row: {
  kind: 'quiz' | 'exam';
  reason: string;
  questionText: string;
  details?: Record<string, unknown>;
  docName?: string;
}): Promise<boolean> => {
  if (!(await currentUserId())) return false;
  try {
    const { error } = await supabase.from('question_reports').insert({
      kind: row.kind,
      reason: row.reason.slice(0, 40),
      question_text: row.questionText.slice(0, 2000),
      details: row.details ?? {},
      doc_name: row.docName ? row.docName.slice(0, 300) : null,
    });
    if (error) { console.warn('[questionReport] Cloud-Meldung nicht gespeichert:', error.message); return false; }
    return true;
  } catch { return false; }
};

let uploadInFlight: Promise<number> | null = null;

/**
 * Lädt alle noch nicht gesendeten Quiz-Meldungen in einem Rutsch hoch (mit
 * ursprünglichem Meldezeitpunkt) und markiert sie als gesendet. Parallele
 * Aufrufe (App-Start + neue Meldung) teilen sich denselben Upload.
 * Rückgabe: Anzahl hochgeladener Meldungen.
 */
export const uploadPendingQuizReports = (): Promise<number> => {
  if (uploadInFlight) return uploadInFlight;
  uploadInFlight = (async () => {
    try {
      if (!(await currentUserId())) return 0;
      const pending = getQuizReports().filter(r => !r.sentAt);
      if (pending.length === 0) return 0;
      const { error } = await supabase.from('question_reports').insert(pending.map(r => ({
        kind: 'quiz',
        reason: String(r.reason).slice(0, 40),
        question_text: r.questionText.slice(0, 2000),
        details: r.details ?? {},
        doc_name: r.docName ? r.docName.slice(0, 300) : null,
        created_at: new Date(r.timestamp || Date.now()).toISOString(),
      })));
      if (error) { console.warn('[questionReport] Nachholen fehlgeschlagen:', error.message); return 0; }
      const sentIds = new Set(pending.map(r => r.id));
      const now = Date.now();
      write(getQuizReports().map(r => (sentIds.has(r.id) ? { ...r, sentAt: now } : r)));
      return pending.length;
    } catch { return 0; } finally { uploadInFlight = null; }
  })();
  return uploadInFlight;
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
  const id = Math.random().toString(36).slice(2, 9);
  if (!duplicate) {
    write([...reports, {
      id, questionText: stored, reason, docName, timestamp: Date.now(),
      details: {
        options: question.options,
        correctAnswerIndices: question.correctAnswerIndices,
        explanation: question.explanation,
        topic: question.topic,
      },
    }]);
  }

  const voided = isVoidingReason(reason);
  const userId = await currentUserId();
  if (voided) {
    voidQuestionInHistory(text, userId);
    removeMistakesByQuestionText(text, userId);
  }
  if (!duplicate) {
    await uploadPendingQuizReports();
    // Lief gerade schon ein Upload (z.B. vom App-Start), war die neue Meldung
    // nicht in dessen Schnappschuss: dann einmal nachschieben.
    if (!getQuizReports().find(r => r.id === id)?.sentAt) await uploadPendingQuizReports();
  }
  return { voided };
};
