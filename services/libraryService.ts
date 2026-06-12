export type SourceStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface SourceMeta {
  displayTitle?: string;
  module?: string;
  semester?: string;
  category?: string;
  tags?: string[];
  examDate?: string;
  notes?: string;
  isAltklausur?: boolean;
  status?: SourceStatus;
  lastOpenedAt?: number;
  quizCount?: number;
  flashcardCount?: number;
  topicCount?: number;
  lastQuizAt?: number;
  avgQuizAccuracy?: number;
  weakTopics?: string[];
}

const STORAGE_KEY = 'quizwise_lib_meta';

const readAll = (): Record<string, SourceMeta> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};

export const getAllMeta = (): Record<string, SourceMeta> => readAll();

export const getMeta = (docId: string): SourceMeta => readAll()[docId] ?? {};

export const saveMeta = (docId: string, patch: Partial<SourceMeta>): void => {
  const all = readAll();
  all[docId] = { ...all[docId], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

export const deleteMeta = (docId: string): void => {
  const all = readAll();
  delete all[docId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

export const incrementStat = (
  docId: string,
  field: 'quizCount' | 'flashcardCount' | 'topicCount'
): void => {
  const meta = getMeta(docId);
  saveMeta(docId, { [field]: (meta[field] ?? 0) + 1 });
};
