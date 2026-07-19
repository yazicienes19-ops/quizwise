import type { QuizQuestion, UserAnswer } from '../types';

const STORAGE_KEY = 'quizwise_quiz_history';

export interface QuizResult {
  id: string;
  docId: string;
  docName: string;
  timestamp: number;
  score: number;
  correctCount: number;
  totalCount: number;
  weakTopics: string[];
  questions: QuizQuestion[];
  answers: UserAnswer[];
}

const readAll = (): QuizResult[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

export const saveQuizResult = (data: Omit<QuizResult, 'id'>, userId?: string | null): QuizResult => {
  const all = readAll();
  const entry: QuizResult = { ...data, id: Math.random().toString(36).slice(2, 9) };
  const updated = [entry, ...all].slice(0, 500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'quiz_history', updated)).catch(() => {});
  }
  return entry;
};

export const getResultsForDoc = (docId: string): QuizResult[] =>
  readAll().filter(r => r.docId === docId);

export const getAllResults = (): QuizResult[] => readAll();

/**
 * Entfernt eine Quiz-Session endgültig aus Verlauf + Cloud. War es die letzte
 * Session zu diesem Dokument, fliegen auch dessen Einträge aus der
 * Fehler-Wiederholungs-Queue — sonst blieben verwaiste Fragen zurück.
 */
export const deleteQuizResult = (id: string, userId?: string | null): void => {
  const all = readAll();
  const target = all.find(r => r.id === id);
  if (!target) return;
  const updated = all.filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'quiz_history', updated)).catch(() => {});
  }
  if (!updated.some(r => r.docName === target.docName)) {
    import('./mistakeReviewService').then(({ removeMistakesByDocName }) => removeMistakesByDocName(target.docName, userId)).catch(() => {});
  }
};

export const getDocStats = (docId: string): {
  count: number;
  lastAt: number | null;
  avgAccuracy: number | null;
  weakTopics: string[];
} => {
  const results = getResultsForDoc(docId);
  if (!results.length) return { count: 0, lastAt: null, avgAccuracy: null, weakTopics: [] };
  const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const topicErrors: Record<string, number> = {};
  results.slice(0, 5).forEach(r =>
    r.weakTopics.forEach(t => { topicErrors[t] = (topicErrors[t] || 0) + 1; })
  );
  const weakTopics = Object.entries(topicErrors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([t]) => t);
  return { count: results.length, lastAt: results[0].timestamp, avgAccuracy: avg, weakTopics };
};
