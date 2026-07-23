
const STORAGE_KEY = 'quizwise_reader_log';
const MAX_ENTRIES = 500;

export interface ReaderLogEntry {
  id: string;
  docId: string;
  /** Für den Dokument-Filter der Fehleranalyse (services/errorPool.ts) — dort
   *  wird wie bei Quiz/Klausur/Feynman nach docName gefiltert, nicht docId.
   *  Optional, damit ältere, bereits gespeicherte Einträge ohne dieses Feld
   *  nicht brechen (kommen dann nur beim kontoweiten Blick vor, nicht gefiltert). */
  docName?: string;
  chapterIndex: number;
  chapterTitle: string;
  concept: string;
  timestamp: number;
  sourceQuote?: string;
  /** Die tatsächlich gegebene Tutor-Antwort — Grundlage für die Fehleranalyse
   *  (Fehleranalyse-Punkt 11), wenn wasEscalated true ist. */
  answer?: string;
  /** true, wenn die Seite/das Kapitel allein die Frage nicht abdeckte und im
   *  gesamten Dokument nachgesehen werden musste (generateGroundedExplanation
   *  found:false beim ersten Versuch) — stärkeres Lücken-Signal als eine
   *  gewöhnliche Verständnisfrage, siehe Fehleranalyse-Punkt 11. */
  wasEscalated?: boolean;
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

/** Kontoweiter Log über alle Dokumente — Grundlage für das Tutor-Fehlersignal
 *  in der Fehleranalyse (services/errorPool.ts), die dokumentübergreifend pooled. */
export function getAllReaderLog(): ReaderLogEntry[] {
  return readAll().sort((a, b) => b.timestamp - a.timestamp);
}

export function getAskedChaptersForDoc(docId: string): number[] {
  const chapters = new Set(getReaderLog(docId).map(e => e.chapterIndex));
  return Array.from(chapters).sort((a, b) => a - b);
}
