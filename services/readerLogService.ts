
const STORAGE_KEY = 'quizwise_reader_log';
const MAX_ENTRIES = 500;

export interface ReaderLogEntry {
  id: string;
  docId: string;
  chapterIndex: number;
  chapterTitle: string;
  concept: string;
  timestamp: number;
  sourceQuote?: string;
}

const readAll = (): ReaderLogEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const writeAll = (all: ReaderLogEntry[], userId?: string | null): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  if (userId) {
    import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'reader_log', all)).catch(() => {});
  }
};

export function logReaderQuestion(entry: Omit<ReaderLogEntry, 'id'>, userId?: string | null): ReaderLogEntry {
  const all = readAll();
  // Dedupe: gleiches Konzept im gleichen Kapitel ersetzt den alten Eintrag statt zu duplizieren
  const filtered = all.filter(e =>
    !(e.docId === entry.docId && e.chapterIndex === entry.chapterIndex && e.concept.toLowerCase() === entry.concept.toLowerCase())
  );
  const newEntry: ReaderLogEntry = { ...entry, id: Math.random().toString(36).slice(2, 9) };
  const updated = [newEntry, ...filtered].slice(0, MAX_ENTRIES);
  writeAll(updated, userId);
  return newEntry;
}

export function getReaderLog(docId: string): ReaderLogEntry[] {
  return readAll().filter(e => e.docId === docId).sort((a, b) => b.timestamp - a.timestamp);
}

export function getAskedChaptersForDoc(docId: string): number[] {
  const chapters = new Set(getReaderLog(docId).map(e => e.chapterIndex));
  return Array.from(chapters).sort((a, b) => a - b);
}
