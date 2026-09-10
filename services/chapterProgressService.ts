
const STORAGE_KEY = 'studearc_reading_progress';

export interface ChapterReadState {
  done: boolean;
  doneAt: number;
}

export type DocReadingProgress = Record<number, ChapterReadState>;
// `__lastPages` ist ein reservierter Schlüssel im selben Speicher (localStorage
// + reading_progress-Cloud-Spalte) für "zuletzt besuchte Seite/Kapitel" pro
// Dokument — kollidiert praktisch nie mit einer echten Dokument-ID (9-stellige
// Base36-Strings), spart aber eine eigene Migration/Cloud-Spalte.
type AllProgress = Record<string, DocReadingProgress> & { __lastPages?: Record<string, number> };

const readAll = (): AllProgress => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const syncToCloud = (all: AllProgress, userId: string): void => {
  import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'reading_progress', all)).catch(() => {});
};

const writeAll = (all: AllProgress, userId?: string | null): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  if (userId) syncToCloud(all, userId);
};

// Blättern löst pro Seite einen Cloud-Upsert aus; mit Pfeiltasten wären das
// Dutzende Schreibvorgänge pro Minute. Lokal sofort, Cloud gesammelt.
const LAST_PAGE_SYNC_DELAY_MS = 1500;
let lastPageSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Speichert die zuletzt besuchte Seite/Kapitel (0-basierter Index, wie
 *  chapterIndex überall sonst in diesem Service) — Grundlage für "beim
 *  Wiederöffnen dort weiterlesen, wo aufgehört wurde". */
export function saveLastPage(docId: string, pageIndex: number, userId?: string | null): void {
  const all = readAll();
  all.__lastPages = { ...(all.__lastPages ?? {}), [docId]: pageIndex };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  if (!userId) return;
  if (lastPageSyncTimer) clearTimeout(lastPageSyncTimer);
  lastPageSyncTimer = setTimeout(() => {
    lastPageSyncTimer = null;
    syncToCloud(readAll(), userId);
  }, LAST_PAGE_SYNC_DELAY_MS);
}

/** undefined = noch nie geöffnet oder keine gespeicherte Position. */
export function getLastPage(docId: string): number | undefined {
  return readAll().__lastPages?.[docId];
}

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
