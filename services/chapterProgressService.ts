
const STORAGE_KEY = 'quizwise_reading_progress';

export interface ChapterReadState {
  done: boolean;
  doneAt: number;
}

export type DocReadingProgress = Record<number, ChapterReadState>;
type AllProgress = Record<string, DocReadingProgress>;

const readAll = (): AllProgress => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const writeAll = (all: AllProgress, userId?: string | null): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  if (userId) {
    import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'reading_progress', all)).catch(() => {});
  }
};

export function markChapterDone(docId: string, chapterIndex: number, userId?: string | null): void {
  const all = readAll();
  const docProgress = { ...(all[docId] ?? {}) };
  docProgress[chapterIndex] = { done: true, doneAt: Date.now() };
  all[docId] = docProgress;
  writeAll(all, userId);
}

export function isChapterDone(docId: string, chapterIndex: number): boolean {
  return !!readAll()[docId]?.[chapterIndex]?.done;
}

export function getDoneChapterIndices(docId: string): number[] {
  const docProgress = readAll()[docId] ?? {};
  return Object.entries(docProgress)
    .filter(([, state]) => state.done)
    .map(([idx]) => Number(idx))
    .sort((a, b) => a - b);
}

export function getDocProgress(docId: string): DocReadingProgress {
  return readAll()[docId] ?? {};
}
