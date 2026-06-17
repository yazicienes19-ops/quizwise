import { QuizQuestion, UserAnswer } from '../types';

export interface SavedQuiz {
  id: string;
  name: string;
  docName: string;
  questions: QuizQuestion[];
  savedAt: number;
  resumeAnswers?: UserAnswer[];
}

const KEY = 'quizwise_saved_quizzes';

export const getSavedQuizzes = (): SavedQuiz[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};

const MAX_SAVED = 20;

export const saveQuizToStorage = (quiz: Omit<SavedQuiz, 'id' | 'savedAt'>, userId?: string | null): void => {
  const quizzes = getSavedQuizzes();
  const entry: SavedQuiz = { ...quiz, id: `sq-${Date.now()}`, savedAt: Date.now() };
  const updated = [entry, ...quizzes].slice(0, MAX_SAVED);
  localStorage.setItem(KEY, JSON.stringify(updated));
  if (userId) import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'saved_quizzes', updated)).catch(() => {});
};

export const deleteSavedQuiz = (id: string, userId?: string | null): void => {
  const updated = getSavedQuizzes().filter(q => q.id !== id);
  localStorage.setItem(KEY, JSON.stringify(updated));
  if (userId) import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'saved_quizzes', updated)).catch(() => {});
};
