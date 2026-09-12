import type { QuizQuestion, UserAnswer } from '../types';

const STORAGE_KEY = 'studearc_quiz_history';

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
  /** Anzahl nachträglich annullierter Fragen (als fehlerhaft gemeldet). */
  voidedCount?: number;
}

const normalizeText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Entfernt eine als fehlerhaft gemeldete Frage ("Antwort falsch", "keine
 * richtige Option") aus allen gespeicherten Sessions und rechnet Wertung,
 * Zähler und Schwachthemen neu. Weil Lernprofil, Coach, Prognose und
 * Fehleranalyse alle aus diesem Verlauf lesen, zählt die Frage danach überall
 * nicht mehr gegen den Nutzer. Sessions ohne verbleibende Antwort fliegen raus.
 */
export const voidQuestionInHistory = (questionText: string, userId?: string | null): number => {
  const key = normalizeText(questionText);
  if (!key) return 0;
  let changed = 0;
  const updated = readAll().flatMap((r): QuizResult[] => {
    const idx = (r.questions || []).findIndex(q => normalizeText(q.question || '') === key);
    if (idx < 0) return [r];
    changed++;
    const questions = r.questions.filter((_, i) => i !== idx);
    const answers = (r.answers || [])
      .filter(a => a.questionIndex !== idx)
      .map(a => (a.questionIndex > idx ? { ...a, questionIndex: a.questionIndex - 1 } : a));
    if (answers.length === 0) return [];
    const correctCount = answers.filter(a => a.isCorrect).length;
    const answerByIndex = new Map(answers.map(a => [a.questionIndex, a]));
    const weakTopics = [...new Set(
      questions.filter((_, i) => !answerByIndex.get(i)?.isCorrect).map(q => q.topic).filter((t): t is string => Boolean(t)),
    )];
    return [{
      ...r, questions, answers, correctCount, weakTopics,
      totalCount: answers.length,
      score: Math.round((correctCount / answers.length) * 100),
      voidedCount: (r.voidedCount ?? 0) + 1,
    }];
  });
  if (changed === 0) return 0;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'quiz_history', updated)).catch(() => {});
  }
  return changed;
};

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
 * Matching über docId, nicht docName: bei Multi-Dokument-Quiz teilen sich
 * unterschiedliche Dokument-Kombinationen sonst denselben generischen Namen
 * ("N Dokumente") und würden sich gegenseitig die Queue fälschlich (nicht)
 * leeren.
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
  if (!updated.some(r => r.docId === target.docId)) {
    import('./mistakeReviewService').then(({ removeMistakesByDocId }) => removeMistakesByDocId(target.docId, userId)).catch(() => {});
  }
};

/**
 * Löscht den kompletten Quiz-Verlauf zu einem Dokument (z.B. beim Löschen des
 * Dokuments selbst) — verwaiste Sessions zu nicht mehr existierenden Quellen
 * sollen nicht in der Lernanalyse stehen bleiben.
 */
export const deleteResultsForDoc = (docId: string, userId?: string | null): void => {
  const all = readAll();
  const updated = all.filter(r => r.docId !== docId);
  if (updated.length === all.length) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'quiz_history', updated)).catch(() => {});
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
