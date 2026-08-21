/**
 * questionFeedbackService — Nutzer-Feedback zur Qualität generierter Quizfragen.
 *
 * Schließt die Lücke, die das Audit gefunden hat: Klausuren haben ein
 * questionFeedback-Feld, Quizfragen hatten keinen Feedback-Weg. Die gemeldeten
 * Fragen bilden später die Datenbasis für Prompt-Tuning und Shuffle-Filter
 * (häufig als „falsch" gemeldete Fragen ausrotten). Lokale Queue bewusst ohne
 * Cloud-Sync: Die Daten werden aggregiert ausgewertet, nicht pro Gerät gebraucht.
 */

export type QuestionFeedbackReason =
  | 'unclear'      // Frage unklar/formuliert
  | 'wrong'        // als richtig markierte Antwort ist falsch
  | 'duplicate'    // inhaltlich doppelte Frage
  | 'too_easy'
  | 'too_hard'
  | 'no_correct'   // keine der Optionen ist richtig
  | 'other';

export interface QuestionFeedbackEntry {
  id: string;
  questionText: string;
  reason: QuestionFeedbackReason;
  docName?: string;
  timestamp: number;
}

const STORAGE_KEY = 'studearc_question_feedback';
const MAX_ENTRIES = 100;

const readAll = (): QuestionFeedbackEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const write = (entries: QuestionFeedbackEntry[]): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
};

export const getQuestionFeedback = (): QuestionFeedbackEntry[] => readAll();

export const reportQuestion = (
  questionText: string,
  reason: QuestionFeedbackReason,
  docName?: string,
): void => {
  const trimmed = questionText.trim();
  if (!trimmed) return;
  const entries = readAll();
  // Dieselbe Frage mit demselben Grund nicht doppelt melden.
  if (entries.some(e => e.questionText === trimmed && e.reason === reason)) return;
  entries.push({
    id: Math.random().toString(36).slice(2, 9),
    questionText: trimmed.slice(0, 500),
    reason,
    docName,
    timestamp: Date.now(),
  });
  // Cap: älteste zuerst verwerfen.
  write(entries.slice(Math.max(0, entries.length - MAX_ENTRIES)));
};

export const clearQuestionFeedback = (): void => write([]);
