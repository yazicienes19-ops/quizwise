const STORAGE_KEY = 'studearc_reader_chat_v1';
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
  /** Klickbare Weiterfragen zur Antwort (null/leer = keine Chips). */
  followUps?: string[] | null;
}

export type DocChat = Record<number, StoredChatEntry[]>;
interface StoredDoc { updatedAt: number; chat: DocChat; }
type AllChat = Record<string, StoredDoc>;

const readAll = (): AllChat => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const writeAll = (all: AllChat): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
};

const syncToCloud = (): void => {
  import('./syncService')
    .then(({ syncOptionalSavedField }) => syncOptionalSavedField('reader_chat', readAll))
    .catch(() => {});
};

// Date.now() allein reicht als Sortierschlüssel nicht: mehrere Speicherungen
// innerhalb derselben Millisekunde (schnelle Interaktionen, Tests) würden sonst
// per stabilem Sort in Einfüge- statt Aktualitätsreihenfolge bleiben. Der
// Millisekunden-Zähler bleibt trotzdem die Basis, damit die Reihenfolge auch
// über Browser-Sitzungen (und Geräte) hinweg korrekt bleibt.
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
      ...(e.followUps && e.followUps.length > 0 ? { followUps: e.followUps.slice(0, 3) } : {}),
    }));
  });
  const previous = all[docId];
  // Der Reader speichert bei jedem Render seinen Stand; unveränderte Chats
  // dürfen weder den Zeitstempel verschieben noch einen Cloud-Upload auslösen.
  if (previous && JSON.stringify(previous.chat) === JSON.stringify(trimmed)) return;
  if (!previous && Object.keys(trimmed).length === 0) return;
  all[docId] = { updatedAt: nextUpdatedAt(), chat: trimmed };
  writeAll(prune(all));
  syncToCloud();
}

export function getReaderChat(docId: string): DocChat {
  return readAll()[docId]?.chat ?? {};
}

/** Cloud-Pull: pro Dokument gewinnt der neuere Stand; lokal-only Dokumente gehen zurück in die Cloud. */
export function mergeCloudReaderChat(cloud: unknown): void {
  const cloudStore: AllChat = cloud && typeof cloud === 'object' && !Array.isArray(cloud) ? cloud as AllChat : {};
  const merged: AllChat = { ...readAll() };
  for (const [docId, entry] of Object.entries(cloudStore)) {
    if (!entry || typeof entry !== 'object' || typeof entry.updatedAt !== 'number' || !entry.chat) continue;
    const local = merged[docId];
    if (!local || entry.updatedAt > local.updatedAt) merged[docId] = entry;
  }
  const pruned = prune(merged);
  writeAll(pruned);
  if (JSON.stringify(pruned) !== JSON.stringify(cloudStore)) syncToCloud();
}
