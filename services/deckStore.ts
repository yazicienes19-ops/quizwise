import type { FlashcardDeck } from '../types';

/**
 * deckStore — einzige Schreibstelle für den lokalen Karteikarten-Stand.
 *
 * Vorher hielten App.tsx (einmalig beim Start aus localStorage geladen) und
 * FlashcardSystem (eigener State + Cloud-Merge) zwei getrennte Kopien. Tutor,
 * Wissensnetz, Quiz-Fehlerdecks und GapRadar schrieben `[...decksAusApp, neu]`
 * zurück und überschrieben damit alles, was seit dem App-Start in den
 * Karteikarten passiert war (neue Decks, bearbeitete Karten, offline gelernte
 * Wiederholungen). Jetzt liest jede Änderung den AKTUELLEN Speicherstand und
 * alle Halter werden per Event nachgezogen (auch tabübergreifend).
 */

export const DECKS_KEY = 'flashcard_decks';
export const DECKS_CHANGED_EVENT = 'studearc:decks-changed';

const isDeck = (d: unknown): d is FlashcardDeck =>
  !!d && typeof (d as FlashcardDeck).id === 'string' && Array.isArray((d as FlashcardDeck).cards);

export const readLocalDecks = (): FlashcardDeck[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DECKS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(isDeck) : [];
  } catch {
    return [];
  }
};

export const writeLocalDecks = (decks: FlashcardDeck[]): void => {
  try { localStorage.setItem(DECKS_KEY, JSON.stringify(decks)); } catch { /* Speicher voll/gesperrt */ }
  try { window.dispatchEvent(new CustomEvent(DECKS_CHANGED_EVENT)); } catch { /* kein window (SSR/Tests) */ }
};

/** Legt ein Deck an oder ersetzt es (gleiche id) auf dem aktuellen Stand. */
export const upsertLocalDeck = (deck: FlashcardDeck): FlashcardDeck[] => {
  const current = readLocalDecks();
  const next = current.some(d => d.id === deck.id)
    ? current.map(d => (d.id === deck.id ? deck : d))
    : [...current, deck];
  writeLocalDecks(next);
  return next;
};

/**
 * Lokale Löschvermerke für ganze Stapel (Stapel-ID → Zeitpunkt). Gesetzt beim
 * Löschen selbst, nicht erst nach Ablauf von "Rückgängig": Wurde der Tab
 * vorher geschlossen, ging die Löschung sonst verloren und der Abgleich holte
 * den Stapel aus der Cloud zurück. deckCloudSync überträgt offene Vermerke.
 */
export const DELETED_DECKS_KEY = 'flashcard_decks_deleted';

export const readDeletedDeckIds = (): Record<string, number> => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DELETED_DECKS_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
};

const writeDeletedDeckIds = (ids: Record<string, number>): void => {
  try { localStorage.setItem(DELETED_DECKS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
};

export const markDecksDeleted = (deckIds: Iterable<string>): void => {
  const ids = readDeletedDeckIds();
  const now = Date.now();
  for (const id of deckIds) ids[id] = now;
  writeDeletedDeckIds(ids);
};

/** "Rückgängig": Vermerk zurücknehmen. */
export const unmarkDecksDeleted = (deckIds: Iterable<string>): void => {
  const ids = readDeletedDeckIds();
  for (const id of deckIds) delete ids[id];
  writeDeletedDeckIds(ids);
};

export const DECKS_OWNER_KEY = 'flashcard_decks_owner';

/**
 * Bindet den lokalen Deck-Stand an ein Konto. Logout leert localStorage
 * nicht: meldete sich danach ein ANDERES Konto an, wurden die Decks des
 * ersten Kontos per Merge in dessen Cloud hochgeladen (gleiches Muster wie
 * das Wissensnetz-Cache-Leck vom 19.08.). Fremder Stand wird verworfen; ohne
 * Besitzer (Altbestand oder vorher ohne Login gelernt) übernimmt ihn das Konto.
 */
export const claimLocalDecks = (userId: string): void => {
  let owner: string | null = null;
  try { owner = localStorage.getItem(DECKS_OWNER_KEY); } catch { return; }
  if (owner === userId) return;
  if (owner) { writeLocalDecks([]); writeDeletedDeckIds({}); }
  try { localStorage.setItem(DECKS_OWNER_KEY, userId); } catch { /* ignore */ }
};

/** Meldet jede Änderung am lokalen Deck-Stand, auch aus anderen Tabs. */
export const subscribeLocalDecks = (onChange: () => void): (() => void) => {
  const onStorage = (e: StorageEvent) => { if (e.key === DECKS_KEY) onChange(); };
  window.addEventListener(DECKS_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DECKS_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};
