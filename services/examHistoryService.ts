
const STORAGE_KEY = 'quizwise_exam_history';

export interface ExamResult {
  id: string;
  docName: string;
  timestamp: number;
  score: number;
  passed: boolean;
  totalPoints: number;
  achievedPoints: number;
  weakTopics: string[];
  categoryBreakdown?: { category: string; score: number }[];
  typeBreakdown?: { type: string; score: number }[];
  /** Score erste vs. zweite Hälfte der Fragen (Original-Reihenfolge) — Signal für Konzentrationsabfall */
  fatigue?: { earlyScore: number; lateScore: number };
}

const readAll = (): ExamResult[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

export const saveExamResult = (data: Omit<ExamResult, 'id'>, userId?: string | null): ExamResult => {
  const all = readAll();
  const entry: ExamResult = { ...data, id: Math.random().toString(36).slice(2, 9) };
  const updated = [entry, ...all].slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'exam_history', updated)).catch(() => {});
  }
  return entry;
};

export const getAllExamResults = (): ExamResult[] => readAll();
