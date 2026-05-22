
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

export const saveRecallResult = (data: Omit<RecallResult, 'id'>): RecallResult => {
  const all = readAll();
  const entry: RecallResult = { ...data, id: Math.random().toString(36).slice(2, 9) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...all].slice(0, 200)));
  return entry;
};

export const getAllRecallResults = (): RecallResult[] => readAll();
