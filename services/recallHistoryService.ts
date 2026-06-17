
const STORAGE_KEY = 'quizwise_recall_history';

export interface RecallResult {
  id: string;
  docName: string;
  timestamp: number;
  score: number;
  topic: string;
  missingPoints: string[];
}

const readAll = (): RecallResult[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

export const saveRecallResult = (data: Omit<RecallResult, 'id'>, userId?: string | null): RecallResult => {
  const all = readAll();
  const entry: RecallResult = { ...data, id: Math.random().toString(36).slice(2, 9) };
  const updated = [entry, ...all].slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'recall_history', updated)).catch(() => {});
  }
  return entry;
};

export const getAllRecallResults = (): RecallResult[] => readAll();
