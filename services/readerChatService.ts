const STORAGE_KEY = 'quizwise_reader_chat_v1';
/** Chat-Antworten sind deutlich größer als reine Log-Einträge (readerLogService)
 *  — enger begrenzt als dort, um localStorage nicht unnötig zu belasten (s.
 *  QuotaExceededError-Vorfall: große Accounts sprengten das Browser-Limit). */
const MAX_DOCS = 15;
const MAX_ENTRIES_PER_INDEX = 20;
const MAX_ANSWER_LENGTH = 4000;

export interface StoredChatEntry {
  concept: string;
  answer: string;
  quote?: string | null;
  /** true, wenn die Antwort erst nach Ausweiten auf das Gesamtdokument entstand
   *  (Seite/Kapitel allein deckte die Frage nicht ab). */
  expandedScope?: boolean;
}

export type DocChat = Record<number, StoredChatEntry[]>;
interface StoredDoc { updatedAt: number; chat: DocChat; }
type AllChat = Record<string, StoredDoc>;

const readAll = (): AllChat => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const writeAll = (all: AllChat): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

// Date.now() allein reicht als Sortierschlüssel nicht: mehrere Speicherungen
// innerhalb derselben Millisekunde (schnelle Interaktionen, Tests) würden sonst
// per stabilem Sort in Einfüge- statt Aktualitätsreihenfolge bleiben. Der
// Millisekunden-Zähler bleibt trotzdem die Basis, damit die Reihenfolge auch
// über Browser-Sitzungen hinweg (Zähler startet dann bei 0) korrekt bleibt.
let tiebreaker = 0;
const nextUpdatedAt = (): number => Date.now() * 1000 + (++tiebreaker % 1000);

/** Behält nur die zuletzt aktualisierten MAX_DOCS Dokumente (LRU-artig). */
const prune = (all: AllChat): AllChat =>
  Object.fromEntries(
    Object.entries(all)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_DOCS)
  );

/**
 * Speichert den kompletten Chat-Zustand eines Dokuments (pro Seite/Kapitel-
 * Index eine Liste fertiger Einträge). Nur abgeschlossene Antworten übergeben —
 * Aufrufer filtern lade-/Fehlerzustände vorher heraus.
 */
export function saveReaderChat(docId: string, chat: DocChat): void {
  const all = readAll();
  const trimmed: DocChat = {};
  Object.entries(chat).forEach(([idx, list]) => {
    if (list.length === 0) return;
    trimmed[Number(idx)] = list.slice(-MAX_ENTRIES_PER_INDEX).map(e => ({
      concept: e.concept,
      answer: e.answer.slice(0, MAX_ANSWER_LENGTH),
      quote: e.quote ?? null,
      ...(e.expandedScope ? { expandedScope: true } : {}),
    }));
  });
  all[docId] = { updatedAt: nextUpdatedAt(), chat: trimmed };
  writeAll(prune(all));
}

export function getReaderChat(docId: string): DocChat {
  return readAll()[docId]?.chat ?? {};
}
