import { ExamQuestion } from '../types';

export interface SavedExam {
  id: string;
  name: string;
  docName: string;
  questions: ExamQuestion[];
  savedAt: number;
}

const KEY = 'quizwise_saved_exams';
const MAX_SAVED = 20;

export const getSavedExams = (): SavedExam[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};

export const saveExamToStorage = (exam: Omit<SavedExam, 'id' | 'savedAt'>): void => {
  const exams = getSavedExams();
  const entry: SavedExam = { ...exam, id: `se-${Date.now()}`, savedAt: Date.now() };
  const updated = [entry, ...exams].slice(0, MAX_SAVED);
  localStorage.setItem(KEY, JSON.stringify(updated));
};

export const deleteSavedExam = (id: string): void => {
  const updated = getSavedExams().filter(e => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(updated));
};
